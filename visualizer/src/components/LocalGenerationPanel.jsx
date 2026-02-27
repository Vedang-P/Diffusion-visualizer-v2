import { useEffect, useMemo, useState } from 'react';
import { loadDatasetFromUrl } from '../utils/datasetLoader';

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:7860';

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function trimSlash(url) {
  return String(url || '').replace(/\/$/, '');
}

export default function LocalGenerationPanel({ onDatasetLoaded }) {
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE_URL);
  const [prompt, setPrompt] = useState('a glass teapot on a wooden table, studio lighting');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality');
  const [cfgScale, setCfgScale] = useState(7.5);
  const [numSteps, setNumSteps] = useState(30);
  const [maxLayers, setMaxLayers] = useState(12);
  const [attentionResolution, setAttentionResolution] = useState(32);
  const [selfAttentionResolution, setSelfAttentionResolution] = useState(32);
  const [outputName, setOutputName] = useState('example_run');

  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loadingDataset, setLoadingDataset] = useState(false);

  const isRunning = job?.status === 'running';

  const normalizedBridge = useMemo(() => trimSlash(bridgeUrl), [bridgeUrl]);

  const startGeneration = async () => {
    if (!prompt.trim()) {
      setError('Prompt is required.');
      return;
    }

    setError('');
    setStatusMessage('Submitting generation job...');

    try {
      const response = await fetch(`${normalizedBridge}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          negative_prompt: negativePrompt.trim(),
          cfg_scale: clampNumber(cfgScale, 7.5, 1, 20),
          num_steps: clampNumber(numSteps, 30, 1, 120),
          max_layers: clampNumber(maxLayers, 12, 1, 64),
          attention_resolution: clampNumber(attentionResolution, 32, 8, 128),
          self_attention_resolution: clampNumber(selfAttentionResolution, 32, 8, 128),
          output_name: outputName.trim()
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || `Failed to start generation (${response.status})`);
      }

      setJob(payload.job || null);
      setStatusMessage('Generation started. Running diffusion pipeline...');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatusMessage('');
    }
  };

  useEffect(() => {
    if (!job?.id || job.status !== 'running') {
      return undefined;
    }

    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`${normalizedBridge}/api/generate/${job.id}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.detail || `Failed to fetch job state (${response.status})`);
        }
        if (!cancelled) {
          setJob(payload.job || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [job?.id, job?.status, normalizedBridge]);

  useEffect(() => {
    if (!job) {
      return;
    }

    if (job.status === 'running') {
      const message = job.progress?.message || 'Generation in progress...';
      setStatusMessage(message);
      return;
    }

    if (job.status === 'failed') {
      setError(job.error || 'Generation failed.');
      setStatusMessage('Generation failed.');
      return;
    }

    if (job.status === 'completed' && job.dataset_url) {
      const run = async () => {
        setLoadingDataset(true);
        setStatusMessage('Generation completed. Loading dataset into the visualizer...');
        setError('');

        try {
          const dataset = await loadDatasetFromUrl(`${normalizedBridge}${job.dataset_url}`);
          onDatasetLoaded(dataset);
          setStatusMessage('Dataset loaded successfully.');
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setLoadingDataset(false);
        }
      };

      run();
    }
  }, [job, normalizedBridge, onDatasetLoaded]);

  const percent = Number(job?.progress?.percent);
  const clampedPercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;

  return (
    <div className="panel local-generator">
      <div className="panel-title-row">
        <h3>Local Generator Bridge</h3>
        <span className="tiny-badge mono">No cloud backend</span>
      </div>

      <p className="warning-text small">
        Start `python3 local_service.py` in `data-generator/` to generate runs from this UI.
      </p>

      <div className="generator-grid">
        <label>
          Service URL
          <input value={bridgeUrl} onChange={(event) => setBridgeUrl(event.target.value)} placeholder={DEFAULT_BRIDGE_URL} />
        </label>
        <label>
          Output Name
          <input value={outputName} onChange={(event) => setOutputName(event.target.value)} placeholder="example_run" />
        </label>
        <label className="full">
          Prompt
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe your scene" />
        </label>
        <label className="full">
          Negative Prompt
          <input value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="blurry, low quality" />
        </label>
        <label>
          CFG Scale
          <input type="number" step="0.1" value={cfgScale} onChange={(event) => setCfgScale(event.target.value)} />
        </label>
        <label>
          Steps
          <input type="number" value={numSteps} onChange={(event) => setNumSteps(event.target.value)} />
        </label>
        <label>
          Max Layers
          <input type="number" value={maxLayers} onChange={(event) => setMaxLayers(event.target.value)} />
        </label>
        <label>
          Attn Resolution
          <input type="number" value={attentionResolution} onChange={(event) => setAttentionResolution(event.target.value)} />
        </label>
        <label>
          Self Attn Resolution
          <input
            type="number"
            value={selfAttentionResolution}
            onChange={(event) => setSelfAttentionResolution(event.target.value)}
          />
        </label>
      </div>

      <div className="generator-actions">
        <button className="primary-btn" disabled={isRunning || loadingDataset} onClick={startGeneration}>
          {isRunning ? 'Generating...' : loadingDataset ? 'Loading Dataset...' : 'Generate Dataset'}
        </button>
        <span className="mono">{job?.status ? `status: ${job.status}` : 'status: idle'}</span>
      </div>

      <div className="progress-wrap">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${clampedPercent}%` }} />
        </div>
        <span className="mono">{clampedPercent.toFixed(1)}%</span>
      </div>

      {statusMessage ? <p className="mono progress-message">{statusMessage}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
