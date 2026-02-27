from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any

import numpy as np
import torch
from diffusers import StableDiffusionPipeline
from tqdm import tqdm

from compression.serializer import DatasetSerializer
from hooks.attention_recorder import AttentionRecorder, create_recording_processors
from metrics.analytics import (
    compute_latent_pca,
    cosine_similarity,
    kl_divergence,
    latent_l2_norm,
    token_importance_ranking,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate static diffusion interpretability dataset.")
    parser.add_argument("--prompt", type=str, required=True)
    parser.add_argument("--negative-prompt", type=str, default="")
    parser.add_argument("--model-id", type=str, default="runwayml/stable-diffusion-v1-5")
    parser.add_argument("--output-dir", type=str, default="dataset")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--cfg-scale", type=float, default=7.5)
    parser.add_argument("--num-steps", type=int, default=30)
    parser.add_argument("--height", type=int, default=512)
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--layers", nargs="*", default=["*attn1*", "*attn2*"])
    parser.add_argument("--max-layers", type=int, default=12)
    parser.add_argument(
        "--include-cross-attention",
        action=argparse.BooleanOptionalAction,
        default=True,
    )
    parser.add_argument(
        "--include-self-attention",
        action=argparse.BooleanOptionalAction,
        default=True,
    )
    parser.add_argument("--attention-resolution", type=int, default=32)
    parser.add_argument("--self-attention-resolution", type=int, default=32)
    parser.add_argument("--device", type=str, choices=["auto", "cuda", "cpu", "mps"], default="auto")
    parser.add_argument("--dtype", type=str, choices=["float16", "float32"], default="float16")
    parser.add_argument(
        "--save-latents-noise",
        action=argparse.BooleanOptionalAction,
        default=True,
    )
    parser.add_argument(
        "--overwrite-output",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Delete existing output directory before writing new dataset.",
    )
    parser.add_argument(
        "--max-dataset-mb",
        type=float,
        default=200.0,
        help="Soft dataset-size budget shown in summary.",
    )
    parser.add_argument(
        "--enforce-size-limit",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Exit with failure if exported dataset exceeds --max-dataset-mb.",
    )
    parser.add_argument(
        "--fail-on-shape-error",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Fail generation if any attention shape validation error is detected.",
    )
    parser.add_argument(
        "--progress-file",
        type=str,
        default="",
        help="Optional JSON file path used to stream generation progress.",
    )
    return parser.parse_args()


def resolve_dtype(dtype_name: str) -> torch.dtype:
    if dtype_name == "float16":
        return torch.float16
    return torch.float32


def resolve_device(device_name: str) -> torch.device:
    if device_name == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")
    return torch.device(device_name)


def to_timestep_int(timestep: Any) -> int:
    if isinstance(timestep, torch.Tensor):
        return int(timestep.detach().cpu().item())
    return int(timestep)


def decode_latents_to_pil(pipe: StableDiffusionPipeline, latents: torch.Tensor):
    scaling = pipe.vae.config.scaling_factor
    with torch.no_grad():
        decoded = pipe.vae.decode(latents / scaling, return_dict=False)[0]
    image = pipe.image_processor.postprocess(decoded, output_type="pil")[0]
    return image


def encode_prompt_embeddings(
    pipe: StableDiffusionPipeline,
    prompt: str,
    negative_prompt: str,
    do_cfg: bool,
    device: torch.device,
):
    out = pipe.encode_prompt(
        prompt=prompt,
        device=device,
        num_images_per_prompt=1,
        do_classifier_free_guidance=do_cfg,
        negative_prompt=negative_prompt,
    )

    if not isinstance(out, tuple) or len(out) < 2:
        raise RuntimeError("Unexpected encode_prompt output; expected prompt and negative prompt embeddings.")

    prompt_embeds, negative_prompt_embeds = out[0], out[1]
    if do_cfg:
        return torch.cat([negative_prompt_embeds, prompt_embeds], dim=0)
    return prompt_embeds


def build_tokens(pipe: StableDiffusionPipeline, prompt: str) -> tuple[list[str], list[int]]:
    text_inputs = pipe.tokenizer(
        prompt,
        padding="max_length",
        max_length=pipe.tokenizer.model_max_length,
        truncation=True,
        return_tensors="pt",
    )
    ids = text_inputs.input_ids[0].tolist()
    tokens = pipe.tokenizer.convert_ids_to_tokens(ids)
    return tokens, ids


def normalize_distribution(values: np.ndarray) -> np.ndarray:
    v = np.clip(values.astype(np.float64), 1e-8, None)
    return v / v.sum()


def infer_meaningful_token_count(
    tokens: list[str],
    token_ids: list[int],
    special_ids: set[int],
) -> int:
    special_tokens = {
        "",
        "<|endoftext|>",
        "</s>",
        "<s>",
        "<pad>",
        "[PAD]",
    }

    started = False
    count = 0

    for token, token_id in zip(tokens, token_ids):
        cleaned = token.strip()
        is_special = token_id in special_ids or cleaned in special_tokens
        if is_special:
            if started:
                break
            continue
        started = True
        count += 1

    return max(1, min(count, len(tokens)))


def write_progress(
    progress_file: Path | None,
    stage: str,
    message: str,
    current_step: int | None = None,
    total_steps: int | None = None,
    dataset_path: str | None = None,
    error: str | None = None,
) -> None:
    if progress_file is None:
        return

    payload: dict[str, Any] = {
        "stage": stage,
        "message": message,
        "current_step": current_step,
        "total_steps": total_steps,
        "percent": None,
        "dataset_path": dataset_path,
        "error": error,
    }

    if (
        isinstance(current_step, int)
        and isinstance(total_steps, int)
        and total_steps > 0
    ):
        payload["percent"] = round((current_step / total_steps) * 100.0, 2)

    progress_file.parent.mkdir(parents=True, exist_ok=True)
    progress_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def prepare_output_dir(output_dir: Path, overwrite_output: bool) -> None:
    resolved = output_dir.resolve()
    if resolved == Path(resolved.anchor):
        raise ValueError("Refusing to use filesystem root as output directory.")

    if output_dir.exists() and any(output_dir.iterdir()):
        if not overwrite_output:
            raise FileExistsError(
                f"Output directory '{output_dir}' is not empty. Use --overwrite-output to replace it."
            )
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)


def validate_attention_assets(output_dir: Path, attention_files: list[dict[str, Any]]) -> dict[str, Any]:
    errors: list[str] = []
    checked = 0

    for entry in attention_files:
        checked += 1
        rel_path = entry.get("path")
        if not isinstance(rel_path, str) or not rel_path:
            errors.append(f"invalid_path_metadata:{entry}")
            continue

        path = output_dir / rel_path
        if not path.exists():
            errors.append(f"missing_file:{rel_path}")
            continue

        shape = entry.get("shape", [])
        if not isinstance(shape, list) or not shape:
            errors.append(f"invalid_shape_metadata:{rel_path}")
            continue

        expected_items = 1
        for dim in shape:
            if not isinstance(dim, int) or dim <= 0:
                errors.append(f"invalid_shape_dimension:{rel_path}:{shape}")
                expected_items = None
                break
            expected_items *= dim

        if expected_items is None:
            continue

        expected_bytes = expected_items * np.dtype(np.float16).itemsize
        actual_bytes = path.stat().st_size
        if actual_bytes != expected_bytes:
            errors.append(
                f"size_mismatch:{rel_path}:expected={expected_bytes}:actual={actual_bytes}"
            )

    return {
        "checked_files": checked,
        "passed": len(errors) == 0,
        "errors": errors,
    }


def main() -> None:
    args = parse_args()
    save_latents_noise = args.save_latents_noise
    progress_file = Path(args.progress_file) if args.progress_file else None

    if args.num_steps <= 0:
        raise ValueError("--num-steps must be greater than 0")
    if args.max_layers < 0:
        raise ValueError("--max-layers must be >= 0")
    if args.max_dataset_mb <= 0:
        raise ValueError("--max-dataset-mb must be greater than 0")

    if args.height % 8 != 0 or args.width % 8 != 0:
        raise ValueError("--height and --width must be divisible by 8")

    device = resolve_device(args.device)
    if device.type == "cpu" and args.dtype == "float16":
        print("float16 on CPU is unsupported for this pipeline; switching to float32")
        args.dtype = "float32"
    dtype = resolve_dtype(args.dtype)

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    output_dir = Path(args.output_dir)
    prepare_output_dir(output_dir, overwrite_output=args.overwrite_output)
    write_progress(
        progress_file=progress_file,
        stage="initializing",
        message="Preparing diffusion pipeline...",
    )

    print(f"Loading pipeline: {args.model_id}")
    pipe = StableDiffusionPipeline.from_pretrained(
        args.model_id,
        torch_dtype=dtype,
        safety_checker=None,
        requires_safety_checker=False,
    )
    pipe = pipe.to(device)
    pipe.set_progress_bar_config(disable=True)
    write_progress(
        progress_file=progress_file,
        stage="loading",
        message="Pipeline loaded. Encoding prompt...",
    )

    do_cfg = args.cfg_scale > 1.0
    prompt_embeds = encode_prompt_embeddings(
        pipe=pipe,
        prompt=args.prompt,
        negative_prompt=args.negative_prompt,
        do_cfg=do_cfg,
        device=device,
    )

    tokens, token_ids = build_tokens(pipe, args.prompt)
    special_ids = set(getattr(pipe.tokenizer, "all_special_ids", []) or [])
    meaningful_token_count = infer_meaningful_token_count(
        tokens=tokens,
        token_ids=token_ids,
        special_ids=special_ids,
    )

    recorder = AttentionRecorder(
        token_count=len(tokens),
        attention_resolution=args.attention_resolution,
        self_attention_resolution=args.self_attention_resolution,
        cfg_enabled=do_cfg,
    )

    processor_map, selected_layers = create_recording_processors(
        unet=pipe.unet,
        recorder=recorder,
        include_self_attention=args.include_self_attention,
        include_cross_attention=args.include_cross_attention,
        layer_patterns=args.layers,
        max_layers=args.max_layers,
    )
    pipe.unet.set_attn_processor(processor_map)

    pipe.scheduler.set_timesteps(args.num_steps, device=device)
    timesteps = pipe.scheduler.timesteps
    total_steps = len(timesteps)
    write_progress(
        progress_file=progress_file,
        stage="generating",
        message="Starting diffusion timesteps...",
        current_step=0,
        total_steps=total_steps,
    )

    latent_shape = (
        1,
        pipe.unet.config.in_channels,
        args.height // pipe.vae_scale_factor,
        args.width // pipe.vae_scale_factor,
    )
    generator = torch.Generator(device=device).manual_seed(args.seed)
    latents = torch.randn(latent_shape, generator=generator, device=device, dtype=dtype)

    serializer = DatasetSerializer(output_dir)

    latent_history: list[np.ndarray] = []
    noise_history: list[np.ndarray] = []

    latent_norms: list[float] = []
    noise_norms: list[float] = []
    cosine_to_previous: list[float | None] = []

    cross_entropy_steps: list[dict[str, Any]] = []
    self_entropy_steps: list[dict[str, Any]] = []
    mean_token_activation_steps: list[list[float]] = []
    shape_errors: list[str] = []

    print(f"Generating {len(timesteps)} timesteps...")
    for step_index, timestep in enumerate(tqdm(timesteps, desc="diffusion")):
        timestep_int = to_timestep_int(timestep)
        recorder.set_step(step_index, timestep_int)

        latent_model_input = torch.cat([latents] * 2) if do_cfg else latents
        latent_model_input = pipe.scheduler.scale_model_input(latent_model_input, timestep)

        with torch.no_grad():
            noise_pred = pipe.unet(
                latent_model_input,
                timestep,
                encoder_hidden_states=prompt_embeds,
                return_dict=False,
            )[0]

        if do_cfg:
            noise_uncond, noise_text = noise_pred.chunk(2)
            noise_pred = noise_uncond + args.cfg_scale * (noise_text - noise_uncond)

        noise_cpu = noise_pred.detach().float().cpu().numpy()[0]
        noise_history.append(noise_cpu.astype(np.float16))
        noise_norms.append(float(np.linalg.norm(noise_cpu.reshape(-1), ord=2)))

        latents = pipe.scheduler.step(noise_pred, timestep, latents, return_dict=False)[0]

        latent_cpu = latents.detach().float().cpu().numpy()[0]
        latent_history.append(latent_cpu.astype(np.float16))
        latent_norms.append(latent_l2_norm(latent_cpu))

        if len(latent_history) == 1:
            cosine_to_previous.append(None)
        else:
            cosine_to_previous.append(
                cosine_similarity(
                    latent_history[-2].astype(np.float32),
                    latent_history[-1].astype(np.float32),
                )
            )

        step_image = decode_latents_to_pil(pipe, latents)
        serializer.save_image(step_index, step_image)

        step_data = recorder.drain_step()
        shape_errors.extend(step_data["shape_errors"])

        for layer_id, cross_map in step_data["cross_maps"].items():
            serializer.save_attention(step_index, layer_id, "cross", cross_map)

        for layer_id, self_map in step_data["self_maps"].items():
            serializer.save_attention(step_index, layer_id, "self", self_map)

        cross_layer_entropy = step_data["cross_entropy"]
        self_layer_entropy = step_data["self_entropy"]

        cross_entropy_steps.append(
            {
                "step": step_index,
                "mean": float(np.mean(list(cross_layer_entropy.values())))
                if cross_layer_entropy
                else None,
                "by_layer": cross_layer_entropy,
            }
        )
        self_entropy_steps.append(
            {
                "step": step_index,
                "mean": float(np.mean(list(self_layer_entropy.values())))
                if self_layer_entropy
                else None,
                "by_layer": self_layer_entropy,
            }
        )

        mean_token_activation = step_data["mean_token_activation"]
        if mean_token_activation is None:
            mean_token_activation = np.zeros((len(tokens),), dtype=np.float32)
        mean_token_activation_steps.append(mean_token_activation.astype(np.float32).tolist())

        write_progress(
            progress_file=progress_file,
            stage="generating",
            message=f"Completed step {step_index + 1} / {total_steps}",
            current_step=step_index + 1,
            total_steps=total_steps,
        )

    pca_input = [x.astype(np.float32) for x in latent_history]
    pca_result = compute_latent_pca(pca_input)

    token_activation_matrix = np.array(mean_token_activation_steps, dtype=np.float32)
    mean_token_scores = token_activation_matrix.mean(axis=0)

    token_dominance = {
        "scores": mean_token_scores.astype(np.float32).tolist(),
        "ranking": token_importance_ranking(mean_token_scores, top_k=min(25, len(tokens))),
    }

    attention_kl_steps: list[float | None] = []
    for i in range(len(token_activation_matrix)):
        if i == 0:
            attention_kl_steps.append(None)
            continue
        prev_dist = normalize_distribution(token_activation_matrix[i - 1])
        curr_dist = normalize_distribution(token_activation_matrix[i])
        attention_kl_steps.append(kl_divergence(curr_dist, prev_dist))

    if save_latents_noise:
        np.savez_compressed(
            output_dir / "latents_noise_fp16.npz",
            latents=np.stack(latent_history, axis=0),
            predicted_noise=np.stack(noise_history, axis=0),
        )

    metadata = {
        "schema_version": "1.0.0",
        "generator": {
            "model_id": args.model_id,
            "seed": args.seed,
            "cfg_scale": args.cfg_scale,
            "num_steps": args.num_steps,
            "height": args.height,
            "width": args.width,
            "layers": args.layers,
            "max_layers": args.max_layers,
            "include_cross_attention": args.include_cross_attention,
            "include_self_attention": args.include_self_attention,
            "attention_resolution": args.attention_resolution,
            "self_attention_resolution": args.self_attention_resolution,
            "dtype": args.dtype,
            "device": str(device),
        },
        "prompt": {
            "text": args.prompt,
            "negative": args.negative_prompt,
            "tokens": tokens,
            "token_ids": token_ids,
            "meaningful_token_count": meaningful_token_count,
        },
        "steps": len(timesteps),
        "timesteps": [to_timestep_int(x) for x in timesteps],
        "images": serializer.image_paths,
        "layers": [
            {
                "id": layer.layer_id,
                "processor_key": layer.processor_key,
                "attention_type": layer.attention_type,
            }
            for layer in selected_layers
        ],
        "attention_files": serializer.attention_files,
        "artifacts": {
            "metrics": "metrics.json",
            "latent_pca": "latent_pca.json",
            "latents_noise": "latents_noise_fp16.npz" if save_latents_noise else None,
        },
    }

    metrics = {
        "latent_l2_norm": latent_norms,
        "predicted_noise_l2_norm": noise_norms,
        "cosine_similarity_to_previous": cosine_to_previous,
        "cross_attention_entropy": cross_entropy_steps,
        "self_attention_entropy": self_entropy_steps,
        "mean_token_activation": mean_token_activation_steps,
        "attention_kl_divergence": attention_kl_steps,
        "token_dominance": token_dominance,
        "shape_validation": {
            "passed": len(shape_errors) == 0,
            "errors": shape_errors,
        },
    }

    latent_pca = {
        "points": pca_result.points,
        "explained_variance_ratio": pca_result.explained_variance_ratio,
    }

    write_progress(
        progress_file=progress_file,
        stage="exporting",
        message="Writing exported dataset to disk...",
        current_step=total_steps,
        total_steps=total_steps,
    )

    serializer.write_json("metadata.json", metadata)
    serializer.write_json("metrics.json", metrics)
    serializer.write_json("latent_pca.json", latent_pca)

    attention_asset_validation = validate_attention_assets(
        output_dir=output_dir,
        attention_files=serializer.attention_files,
    )

    schema_validation = {
        "metadata_has_required_keys": all(
            k in metadata for k in ["schema_version", "prompt", "steps", "timesteps", "images", "layers", "attention_files"]
        ),
        "pca_points_match_steps": len(latent_pca["points"]) == metadata["steps"],
        "metrics_steps_match": len(metrics["latent_l2_norm"]) == metadata["steps"],
        "attention_assets": attention_asset_validation,
    }
    serializer.write_json("validation.json", schema_validation)

    size_mb = serializer.dataset_size_bytes() / (1024 * 1024)
    print(json.dumps(schema_validation, indent=2))
    print(f"Dataset written to: {output_dir.resolve()}")
    print(f"Dataset size: {size_mb:.2f} MB")
    if size_mb > args.max_dataset_mb:
        message = (
            f"Dataset exceeds size budget ({size_mb:.2f}MB > {args.max_dataset_mb:.2f}MB). "
            "Reduce steps, layers, or attention resolution."
        )
        if args.enforce_size_limit:
            raise RuntimeError(message)
        print(f"WARNING: {message}")

    if args.fail_on_shape_error and shape_errors:
        raise RuntimeError(
            "Shape validation errors were detected. Re-run with fewer layers or disable unsupported captures."
        )

    if args.fail_on_shape_error and not attention_asset_validation["passed"]:
        raise RuntimeError("Attention asset validation failed.")

    write_progress(
        progress_file=progress_file,
        stage="completed",
        message="Generation finished successfully.",
        current_step=total_steps,
        total_steps=total_steps,
        dataset_path=str(output_dir.resolve()),
    )


if __name__ == "__main__":
    main()
