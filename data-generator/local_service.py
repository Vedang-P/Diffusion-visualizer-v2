from __future__ import annotations

import json
import re
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
DATASET_ROOT = BASE_DIR / "dataset"
PROGRESS_ROOT = BASE_DIR / "outputs" / "runtime_progress"
DATASET_ROOT.mkdir(parents=True, exist_ok=True)
PROGRESS_ROOT.mkdir(parents=True, exist_ok=True)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_output_name(name: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_.-]+", "_", name.strip())
    normalized = normalized.strip("._")
    return normalized or f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=400)
    negative_prompt: str = Field(default="", max_length=400)
    cfg_scale: float = Field(default=7.5, ge=1.0, le=20.0)
    num_steps: int = Field(default=30, ge=1, le=120)
    max_layers: int = Field(default=12, ge=1, le=64)
    attention_resolution: int = Field(default=32, ge=8, le=128)
    self_attention_resolution: int = Field(default=32, ge=8, le=128)
    output_name: str = Field(default="", max_length=80)


@dataclass
class JobState:
    id: str
    status: str
    request: dict[str, Any]
    output_name: str
    output_dir: str
    progress_file: str
    created_at: str
    updated_at: str
    progress: dict[str, Any] = field(default_factory=dict)
    dataset_url: str | None = None
    error: str | None = None
    logs: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status,
            "request": self.request,
            "output_name": self.output_name,
            "output_dir": self.output_dir,
            "progress_file": self.progress_file,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "progress": self.progress,
            "dataset_url": self.dataset_url,
            "error": self.error,
            "logs": self.logs,
        }


app = FastAPI(title="Diffusion Visualizer Local Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/datasets", StaticFiles(directory=str(DATASET_ROOT)), name="datasets")

_jobs: dict[str, JobState] = {}
_jobs_lock = threading.Lock()


def _update_job(job_id: str, **kwargs: Any) -> None:
    with _jobs_lock:
        job = _jobs[job_id]
        for key, value in kwargs.items():
            setattr(job, key, value)
        job.updated_at = utc_now_iso()


def _read_progress(progress_file: Path) -> dict[str, Any] | None:
    if not progress_file.exists():
        return None
    try:
        return json.loads(progress_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _monitor_job(job_id: str, process: subprocess.Popen[str], progress_file: Path, output_name: str) -> None:
    while process.poll() is None:
        progress = _read_progress(progress_file)
        if progress is not None:
            _update_job(job_id, progress=progress)
        time.sleep(0.75)

    stdout, stderr = process.communicate()
    combined_logs = "\n".join([stdout.strip(), stderr.strip()]).strip()
    if len(combined_logs) > 10000:
        combined_logs = combined_logs[-10000:]

    progress = _read_progress(progress_file) or {}

    if process.returncode == 0:
        _update_job(
            job_id,
            status="completed",
            progress=progress,
            dataset_url=f"/datasets/{output_name}",
            logs=combined_logs,
        )
        return

    error_message = progress.get("error") or stderr.strip() or "Generation failed"
    _update_job(
        job_id,
        status="failed",
        progress=progress,
        error=error_message,
        logs=combined_logs,
    )


def _has_running_job() -> bool:
    with _jobs_lock:
        return any(job.status == "running" for job in _jobs.values())


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "time": utc_now_iso()}


@app.get("/api/generate/latest")
def latest_job() -> dict[str, Any]:
    with _jobs_lock:
        jobs = list(_jobs.values())

    if not jobs:
        return {"job": None}

    jobs.sort(key=lambda item: item.updated_at, reverse=True)
    return {"job": jobs[0].to_dict()}


@app.get("/api/generate/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job": job.to_dict()}


@app.post("/api/generate")
def create_job(payload: GenerateRequest) -> dict[str, Any]:
    if _has_running_job():
        raise HTTPException(status_code=409, detail="A generation job is already running")

    job_id = uuid.uuid4().hex[:10]
    output_name = safe_output_name(payload.output_name)
    output_dir = DATASET_ROOT / output_name
    progress_file = PROGRESS_ROOT / f"{job_id}.json"

    cmd = [
        sys.executable,
        str(BASE_DIR / "generate.py"),
        "--prompt",
        payload.prompt,
        "--negative-prompt",
        payload.negative_prompt,
        "--cfg-scale",
        str(payload.cfg_scale),
        "--num-steps",
        str(payload.num_steps),
        "--max-layers",
        str(payload.max_layers),
        "--attention-resolution",
        str(payload.attention_resolution),
        "--self-attention-resolution",
        str(payload.self_attention_resolution),
        "--output-dir",
        str(output_dir),
        "--overwrite-output",
        "--progress-file",
        str(progress_file),
    ]

    process = subprocess.Popen(
        cmd,
        cwd=str(BASE_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    now = utc_now_iso()
    state = JobState(
        id=job_id,
        status="running",
        request=payload.model_dump(),
        output_name=output_name,
        output_dir=str(output_dir.resolve()),
        progress_file=str(progress_file.resolve()),
        created_at=now,
        updated_at=now,
    )

    with _jobs_lock:
        _jobs[job_id] = state

    monitor_thread = threading.Thread(
        target=_monitor_job,
        args=(job_id, process, progress_file, output_name),
        daemon=True,
    )
    monitor_thread.start()

    return {"job": state.to_dict()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "local_service:app",
        host="127.0.0.1",
        port=7860,
        reload=False,
    )
