# Static Diffusion Interpretability Visualizer

Production-ready two-part system for diffusion interpretability using **precomputed runs only**.

- `data-generator/`: offline Python pipeline (GPU recommended) that runs Stable Diffusion, captures internals, computes metrics/PCA, and exports a static dataset.
- `visualizer/`: static React + D3 app that loads exported artifacts client-side (no backend, no live inference).

## 1. System Architecture

```text
/data-generator
  generate.py                  # Offline dataset generation entrypoint
  validate_dataset.py          # Post-export dataset validator
  hooks/attention_recorder.py  # UNet attention capture processors
  metrics/analytics.py         # Metrics + PCA utilities
  compression/serializer.py    # JSON/binary output writer
  outputs/schema.json          # Dataset JSON schema reference

/visualizer
  src/components/              # Loaders + UI controls
  src/visualizations/          # Timeline, attention, PCA, comparison modules
  src/utils/                   # Dataset IO, cache, worker client
  src/workers/                 # Float16 decode + divergence worker
  public/datasets/default/     # Optional default static dataset mount
```

## 2. Core Capabilities

### Offline generator
- Runs Stable Diffusion locally (`diffusers`)
- Hooks UNet cross/self attention processors
- Captures per-step:
  - latent tensors
  - predicted noise
  - cross-attention maps
  - self-attention maps
- Computes:
  - latent L2 norm
  - latent cosine similarity to previous step
  - attention entropy
  - token dominance + ranking
  - KL divergence across timestep token distributions
  - 2D latent PCA trajectory
- Exports compact static dataset (`float16` binaries + JSON)

### Static frontend
- Denoising timeline with playback + latent norm curve
- Attention explorer (token/layer selectors + heatmap overlay)
- PCA latent trajectory with image preview
- Comparative mode for two datasets (attention JS divergence + trajectory deltas)
- Lazy asset loading, worker-based heavy operations, bounded caches

## 3. Prerequisites

### Generator
- Python `>=3.10`
- CUDA GPU recommended
- `pip`/virtualenv

### Visualizer
- Node `>=20` and npm `>=10` (see [`visualizer/.nvmrc`](visualizer/.nvmrc))

## 4. Quick Start

### A) Generate dataset offline

```bash
cd data-generator
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python3 generate.py \
  --prompt "a glass teapot on a wooden table, studio lighting" \
  --negative-prompt "blurry, low quality" \
  --cfg-scale 7.5 \
  --num-steps 30 \
  --attention-resolution 32 \
  --self-attention-resolution 32 \
  --max-layers 12 \
  --output-dir dataset/example_run
```

Validate exported dataset:

```bash
python3 validate_dataset.py dataset/example_run --strict
```

### B) Run visualizer

```bash
cd ../visualizer
npm install
npm run dev
```

Load dataset from:
- URL (for deployed static assets), or
- folder selection (`metadata.json`, `metrics.json`, `latent_pca.json`, `images/`, `attention/`)

### C) Optional: Generate from the website (local bridge mode)

Run a local API bridge in another terminal:

```bash
cd data-generator
source .venv/bin/activate
python3 local_service.py
```

Then open the visualizer and use **Local Generator Bridge**:
- enter prompt and generation settings
- start generation
- watch live progress bar + stage updates
- dataset auto-loads when generation completes

## 5. Generator CLI (Important Flags)

| Flag | Purpose |
| --- | --- |
| `--prompt` | Required text prompt |
| `--negative-prompt` | Negative prompt for CFG |
| `--cfg-scale` | Classifier-free guidance scale |
| `--num-steps` | Diffusion timesteps |
| `--layers` | Glob patterns for attention processors |
| `--max-layers` | Upper bound on recorded layers |
| `--include-cross-attention / --no-include-cross-attention` | Toggle cross-attention capture |
| `--include-self-attention / --no-include-self-attention` | Toggle self-attention capture |
| `--attention-resolution` | Cross-attention downsample size |
| `--self-attention-resolution` | Self-attention pooled size |
| `--save-latents-noise / --no-save-latents-noise` | Export or skip `latents_noise_fp16.npz` |
| `--overwrite-output` | Replace existing non-empty output directory |
| `--max-dataset-mb` | Size budget threshold (default `200`) |
| `--enforce-size-limit` | Fail if dataset exceeds budget |
| `--fail-on-shape-error` | Fail on attention shape validation errors |
| `--device auto|cuda|cpu|mps` | Device selection |

## 6. Dataset Output Contract

Generated directory:

```text
dataset/<run_name>/
  metadata.json
  metrics.json
  latent_pca.json
  validation.json
  latents_noise_fp16.npz        # optional
  images/
    step_000.png
    ...
  attention/
    cross/
      layer_0_step_000.bin
      ...
    self/
      layer_0_step_000.bin
      ...
```

Reference schema: [`data-generator/outputs/schema.json`](data-generator/outputs/schema.json)

## 7. Frontend Build and Deploy

### Production build

```bash
cd visualizer
npm run build
```

Static output: `visualizer/dist/`

### Vercel
- Root directory: `visualizer`
- Build command: `npm run build`
- Output directory: `dist`
- Config: [`visualizer/vercel.json`](visualizer/vercel.json)

### Netlify
- Base directory: `visualizer`
- Build command: `npm run build`
- Publish directory: `dist`
- Config: [`visualizer/netlify.toml`](visualizer/netlify.toml)

No backend service required.

## 8. Production Validation Checklist

Before release:

1. Run generator and ensure `validation.json` passes.
2. Run `python3 validate_dataset.py <dataset> --strict`.
3. Confirm dataset size remains under target budget.
4. Run `npm run build` and verify no build warnings/errors.
5. Smoke test in Chrome + Firefox:
   - timeline playback
   - attention overlay load
   - PCA trajectory hover/click
   - comparative divergence for two datasets

## 9. Operational Notes

- Attention assets are loaded on demand and cached with bounded size to reduce memory pressure.
- Heavy decode/divergence work runs in a Web Worker; request timeout and crash recovery are implemented.
- For reproducible runs, pin model revision externally if strict reproducibility is required.
- For large runs, reduce `--num-steps`, `--max-layers`, and attention resolutions to stay within memory/size constraints.

## 10. Troubleshooting

- `Output directory ... is not empty`: pass `--overwrite-output`.
- Dataset too large: lower steps/layers/resolutions, or disable latent/noise artifact.
- Missing cross-attention UI data: ensure generator captured cross layers (`--include-cross-attention` and layer patterns).
- Frontend load fails for folder input: verify selected folder contains top-level `metadata.json` and referenced artifact paths.
