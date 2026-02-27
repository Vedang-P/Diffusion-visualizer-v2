from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


REQUIRED_METADATA_KEYS = [
    "schema_version",
    "generator",
    "prompt",
    "steps",
    "timesteps",
    "images",
    "layers",
    "attention_files",
]


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Missing file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {path}: {exc}") from exc


def validate(dataset_dir: Path) -> tuple[bool, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    metadata = read_json(dataset_dir / "metadata.json")
    metrics = read_json(dataset_dir / "metrics.json")
    latent_pca = read_json(dataset_dir / "latent_pca.json")

    for key in REQUIRED_METADATA_KEYS:
        if key not in metadata:
            errors.append(f"metadata missing key: {key}")

    steps = metadata.get("steps")
    if not isinstance(steps, int) or steps <= 0:
        errors.append("metadata.steps must be a positive integer")
        return False, errors, warnings

    if len(metadata.get("timesteps", [])) != steps:
        errors.append("metadata.timesteps length mismatch")

    if len(metadata.get("images", [])) != steps:
        errors.append("metadata.images length mismatch")

    if len(metrics.get("latent_l2_norm", [])) != steps:
        errors.append("metrics.latent_l2_norm length mismatch")

    if len(latent_pca.get("points", [])) != steps:
        errors.append("latent_pca.points length mismatch")

    if len(latent_pca.get("explained_variance_ratio", [])) != 2:
        errors.append("latent_pca.explained_variance_ratio must have exactly two values")

    for idx, entry in enumerate(metadata.get("attention_files", [])):
        rel_path = entry.get("path")
        shape = entry.get("shape")

        if not isinstance(rel_path, str) or not rel_path:
            errors.append(f"attention_files[{idx}] has invalid path")
            continue
        if not isinstance(shape, list) or not shape:
            errors.append(f"attention_files[{idx}] has invalid shape")
            continue
        if any((not isinstance(dim, int) or dim <= 0) for dim in shape):
            errors.append(f"attention_files[{idx}] has non-positive shape dimensions")
            continue

        file_path = dataset_dir / rel_path
        if not file_path.exists():
            errors.append(f"missing attention file: {rel_path}")
            continue

        expected_items = math.prod(shape)
        expected_bytes = expected_items * 2  # float16 byte size
        actual_bytes = file_path.stat().st_size
        if expected_bytes != actual_bytes:
            errors.append(
                f"attention size mismatch for {rel_path} (expected {expected_bytes} bytes, got {actual_bytes})"
            )

    size_mb = sum(path.stat().st_size for path in dataset_dir.rglob("*") if path.is_file()) / (1024 * 1024)
    if size_mb > 200:
        warnings.append(f"dataset size is {size_mb:.2f}MB (>200MB)")

    return len(errors) == 0, errors, warnings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate an exported diffusion visualizer dataset")
    parser.add_argument("dataset_dir", type=str, help="Path to dataset directory")
    parser.add_argument(
        "--strict",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Treat warnings as failure",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dataset_dir = Path(args.dataset_dir)

    if not dataset_dir.exists() or not dataset_dir.is_dir():
        raise FileNotFoundError(f"Dataset directory does not exist: {dataset_dir}")

    valid, errors, warnings = validate(dataset_dir)

    print(f"dataset: {dataset_dir.resolve()}")
    if errors:
        print("errors:")
        for item in errors:
            print(f"  - {item}")
    if warnings:
        print("warnings:")
        for item in warnings:
            print(f"  - {item}")

    if not valid or (args.strict and warnings):
        raise SystemExit(1)

    print("validation: passed")


if __name__ == "__main__":
    main()
