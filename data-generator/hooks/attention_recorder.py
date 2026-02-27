from __future__ import annotations

import fnmatch
import math
from dataclasses import dataclass
from typing import Dict, List

import numpy as np
import torch
import torch.nn.functional as F


@dataclass
class LayerInfo:
    layer_id: str
    processor_key: str
    attention_type: str


class AttentionRecorder:
    def __init__(
        self,
        token_count: int,
        attention_resolution: int,
        self_attention_resolution: int,
        cfg_enabled: bool,
    ) -> None:
        if token_count <= 0:
            raise ValueError("token_count must be > 0")
        if attention_resolution <= 0 or self_attention_resolution <= 0:
            raise ValueError("attention resolutions must be > 0")

        self.token_count = token_count
        self.attention_resolution = attention_resolution
        self.self_attention_resolution = self_attention_resolution
        self.cfg_enabled = cfg_enabled

        self.current_step = -1
        self.current_timestep = -1
        self._cross_maps: dict[str, np.ndarray] = {}
        self._self_maps: dict[str, np.ndarray] = {}
        self._cross_entropy: dict[str, float] = {}
        self._self_entropy: dict[str, float] = {}
        self._token_activation_by_layer: dict[str, np.ndarray] = {}
        self.shape_errors: list[str] = []

    def set_step(self, step: int, timestep: int) -> None:
        self.current_step = step
        self.current_timestep = timestep
        self._cross_maps.clear()
        self._self_maps.clear()
        self._cross_entropy.clear()
        self._self_entropy.clear()
        self._token_activation_by_layer.clear()

    def _extract_conditional_attention(
        self, attention_probs: torch.Tensor, heads: int
    ) -> torch.Tensor | None:
        if attention_probs.ndim != 3:
            self.shape_errors.append(
                f"step={self.current_step} has invalid attention rank {attention_probs.ndim}"
            )
            return None

        if heads <= 0:
            self.shape_errors.append(
                f"step={self.current_step} has invalid head count {heads}"
            )
            return None

        batch_heads, query_tokens, key_tokens = attention_probs.shape
        if batch_heads % heads != 0:
            self.shape_errors.append(
                f"step={self.current_step} cannot reshape attention {list(attention_probs.shape)} with heads={heads}"
            )
            return None

        batch = batch_heads // heads
        reshaped = attention_probs.reshape(batch, heads, query_tokens, key_tokens)
        cond_index = batch - 1 if self.cfg_enabled and batch > 1 else 0
        return reshaped[cond_index].mean(dim=0)

    def _entropy(self, matrix: torch.Tensor) -> float:
        p = matrix.clamp(min=1e-8)
        entropy = -(p * p.log()).sum(dim=-1).mean()
        return float(entropy.detach().cpu().item())

    def record(
        self,
        layer_id: str,
        attention_type: str,
        attention_probs: torch.Tensor,
        heads: int,
    ) -> None:
        with torch.no_grad():
            if attention_type not in {"cross", "self"}:
                self.shape_errors.append(
                    f"step={self.current_step} layer={layer_id} has unsupported attention type '{attention_type}'"
                )
                return

            matrix = self._extract_conditional_attention(attention_probs, heads)
            if matrix is None:
                return

            if attention_type == "cross":
                self._cross_entropy[layer_id] = self._entropy(matrix)
                token_activation = matrix.mean(dim=0).detach().float().cpu().numpy()
                self._token_activation_by_layer[layer_id] = token_activation

                query_tokens = matrix.shape[0]
                side = int(math.sqrt(query_tokens))
                if side * side != query_tokens:
                    self.shape_errors.append(
                        f"step={self.current_step} layer={layer_id} query_tokens={query_tokens} is not square"
                    )
                    return

                token_maps = matrix.transpose(0, 1).reshape(
                    matrix.shape[1], side, side
                )
                token_maps = token_maps.unsqueeze(0)
                downsampled = F.interpolate(
                    token_maps,
                    size=(self.attention_resolution, self.attention_resolution),
                    mode="bilinear",
                    align_corners=False,
                )[0]

                if downsampled.shape[0] != self.token_count:
                    min_tokens = min(downsampled.shape[0], self.token_count)
                    fixed = torch.zeros(
                        (self.token_count, self.attention_resolution, self.attention_resolution),
                        dtype=downsampled.dtype,
                        device=downsampled.device,
                    )
                    fixed[:min_tokens] = downsampled[:min_tokens]
                    downsampled = fixed

                self._cross_maps[layer_id] = (
                    downsampled.detach().to(dtype=torch.float16).cpu().numpy()
                )
                return

            self._self_entropy[layer_id] = self._entropy(matrix)
            pooled = F.adaptive_avg_pool2d(
                matrix.unsqueeze(0).unsqueeze(0),
                (self.self_attention_resolution, self.self_attention_resolution),
            )[0, 0]
            self._self_maps[layer_id] = pooled.detach().to(dtype=torch.float16).cpu().numpy()

    def drain_step(self) -> dict:
        mean_token_activation = None
        if self._token_activation_by_layer:
            stacked = np.stack(list(self._token_activation_by_layer.values()), axis=0)
            mean_token_activation = stacked.mean(axis=0).astype(np.float32)

        output = {
            "step": self.current_step,
            "timestep": self.current_timestep,
            "cross_maps": dict(self._cross_maps),
            "self_maps": dict(self._self_maps),
            "cross_entropy": dict(self._cross_entropy),
            "self_entropy": dict(self._self_entropy),
            "mean_token_activation": mean_token_activation,
            "shape_errors": list(self.shape_errors),
        }
        self.shape_errors.clear()
        return output


class RecordingAttnProcessor:
    def __init__(self, recorder: AttentionRecorder, layer_id: str, attention_type: str) -> None:
        self.recorder = recorder
        self.layer_id = layer_id
        self.attention_type = attention_type

    def __call__(
        self,
        attn,
        hidden_states,
        encoder_hidden_states=None,
        attention_mask=None,
        temb=None,
        *args,
        **kwargs,
    ):
        residual = hidden_states

        if attn.spatial_norm is not None:
            hidden_states = attn.spatial_norm(hidden_states, temb)

        input_ndim = hidden_states.ndim
        if input_ndim == 4:
            batch_size, channel, height, width = hidden_states.shape
            hidden_states = hidden_states.view(batch_size, channel, height * width).transpose(1, 2)

        batch_size, sequence_length, _ = (
            hidden_states.shape
            if encoder_hidden_states is None
            else encoder_hidden_states.shape
        )
        attention_mask = attn.prepare_attention_mask(attention_mask, sequence_length, batch_size)

        if attn.group_norm is not None:
            hidden_states = attn.group_norm(hidden_states.transpose(1, 2)).transpose(1, 2)

        query = attn.to_q(hidden_states)

        if encoder_hidden_states is None:
            encoder_hidden_states = hidden_states
        elif attn.norm_cross:
            encoder_hidden_states = attn.norm_encoder_hidden_states(encoder_hidden_states)

        key = attn.to_k(encoder_hidden_states)
        value = attn.to_v(encoder_hidden_states)

        query = attn.head_to_batch_dim(query)
        key = attn.head_to_batch_dim(key)
        value = attn.head_to_batch_dim(value)

        attention_probs = attn.get_attention_scores(query, key, attention_mask)
        self.recorder.record(
            layer_id=self.layer_id,
            attention_type=self.attention_type,
            attention_probs=attention_probs.detach(),
            heads=attn.heads,
        )

        hidden_states = torch.bmm(attention_probs, value)
        hidden_states = attn.batch_to_head_dim(hidden_states)

        hidden_states = attn.to_out[0](hidden_states)
        hidden_states = attn.to_out[1](hidden_states)

        if input_ndim == 4:
            hidden_states = hidden_states.transpose(-1, -2).reshape(
                batch_size, channel, height, width
            )

        if attn.residual_connection:
            hidden_states = hidden_states + residual

        hidden_states = hidden_states / attn.rescale_output_factor
        return hidden_states


def _matches_any_pattern(value: str, patterns: List[str]) -> bool:
    if not patterns:
        return True
    return any(fnmatch.fnmatch(value, pattern) for pattern in patterns)


def create_recording_processors(
    unet,
    recorder: AttentionRecorder,
    include_self_attention: bool,
    include_cross_attention: bool,
    layer_patterns: List[str],
    max_layers: int,
):
    processor_map: Dict[str, object] = {}
    selected_layers: List[LayerInfo] = []

    ordered_items = list(unet.attn_processors.items())
    for key, original in ordered_items:
        is_cross = ".attn2." in key
        is_self = ".attn1." in key

        keep_kind = (is_cross and include_cross_attention) or (is_self and include_self_attention)
        matches = _matches_any_pattern(key, layer_patterns)

        if keep_kind and matches and (max_layers <= 0 or len(selected_layers) < max_layers):
            layer_id = f"layer_{len(selected_layers)}"
            attention_type = "cross" if is_cross else "self"
            processor_map[key] = RecordingAttnProcessor(recorder, layer_id, attention_type)
            selected_layers.append(
                LayerInfo(layer_id=layer_id, processor_key=key, attention_type=attention_type)
            )
        else:
            processor_map[key] = original

    if not selected_layers:
        raise RuntimeError(
            "No attention layers selected. Adjust --layers, --include-cross-attention, and --include-self-attention."
        )

    return processor_map, selected_layers
