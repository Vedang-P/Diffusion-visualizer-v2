from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np


class DatasetSerializer:
    def __init__(self, output_dir: str | Path) -> None:
        self.output_dir = Path(output_dir)
        self.images_dir = self.output_dir / "images"
        self.attention_dir = self.output_dir / "attention"
        self.cross_attention_dir = self.attention_dir / "cross"
        self.self_attention_dir = self.attention_dir / "self"

        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.cross_attention_dir.mkdir(parents=True, exist_ok=True)
        self.self_attention_dir.mkdir(parents=True, exist_ok=True)

        self.attention_files: list[dict[str, Any]] = []
        self.image_paths: list[str] = []

    def save_image(self, step: int, image) -> str:
        file_name = f"step_{step:03d}.png"
        path = self.images_dir / file_name
        image.save(path, format="PNG", optimize=True)
        rel = str(path.relative_to(self.output_dir))
        self.image_paths.append(rel)
        return rel

    def save_attention(self, step: int, layer_id: str, attention_type: str, array: np.ndarray) -> dict:
        if array.dtype != np.float16:
            array = array.astype(np.float16)

        file_name = f"{layer_id}_step_{step:03d}.bin"
        if attention_type == "cross":
            path = self.cross_attention_dir / file_name
        elif attention_type == "self":
            path = self.self_attention_dir / file_name
        else:
            raise ValueError(f"Unsupported attention type: {attention_type}")
        array.tofile(path)

        record = {
            "step": step,
            "layer_id": layer_id,
            "attention_type": attention_type,
            "path": str(path.relative_to(self.output_dir)),
            "shape": list(array.shape),
            "dtype": "float16",
        }
        self.attention_files.append(record)
        return record

    def write_json(self, path: str | Path, payload: dict[str, Any]) -> None:
        target = self.output_dir / path
        target.parent.mkdir(parents=True, exist_ok=True)
        temp_target = target.with_suffix(f"{target.suffix}.tmp")
        temp_target.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        temp_target.replace(target)

    def dataset_size_bytes(self) -> int:
        total = 0
        for file in self.output_dir.rglob("*"):
            if file.is_file():
                total += file.stat().st_size
        return total
