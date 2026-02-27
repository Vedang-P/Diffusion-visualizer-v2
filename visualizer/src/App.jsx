import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import DatasetLoader from './components/DatasetLoader';
import LocalGenerationPanel from './components/LocalGenerationPanel';
import { cleanupDatasetResources, getImageSrc, loadDatasetFromUrl } from './utils/datasetLoader';
import { disposeAttentionWorker } from './utils/attentionWorkerClient';
import { getMeaningfulTokenCount, normalizeToken } from './utils/tokenUtils';

const DenoisingTimeline = lazy(() => import('./visualizations/DenoisingTimeline'));
const AttentionExplorer = lazy(() => import('./visualizations/AttentionExplorer'));
const LatentTrajectory = lazy(() => import('./visualizations/LatentTrajectory'));
const ComparativeMode = lazy(() => import('./visualizations/ComparativeMode'));

const AUTO_DATASET_URL = './datasets/default';

function formatToken(token) {
  return normalizeToken(token);
}

export default function App() {
  const [dataset, setDataset] = useState(null);
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMs, setPlaybackMs] = useState(220);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [autoLoadStatus, setAutoLoadStatus] = useState('booting');
  const [autoLoadMessage, setAutoLoadMessage] = useState('');

  const handleDatasetLoaded = (nextDataset) => {
    setDataset((prevDataset) => {
      cleanupDatasetResources(prevDataset);
      return nextDataset;
    });
    setStep(0);
    setIsPlaying(true);
    setShowLoader(false);
    setShowCompare(false);
    setAutoLoadStatus('ready');
    setAutoLoadMessage('');
  };

  const handleClearDataset = () => {
    setDataset((prevDataset) => {
      cleanupDatasetResources(prevDataset);
      return null;
    });
    setIsPlaying(false);
    setStep(0);
    setShowCompare(false);
  };

  useEffect(() => {
    let cancelled = false;

    const autoLoad = async () => {
      try {
        const autoDataset = await loadDatasetFromUrl(AUTO_DATASET_URL);
        if (cancelled) {
          cleanupDatasetResources(autoDataset);
          return;
        }
        handleDatasetLoaded(autoDataset);
      } catch (err) {
        if (!cancelled) {
          setAutoLoadStatus('failed');
          setAutoLoadMessage(err instanceof Error ? err.message : String(err));
        }
      }
    };

    autoLoad();

    return () => {
      cancelled = true;
    };
    // intentionally run once for boot auto-detection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dataset || !isPlaying) {
      return undefined;
    }

    const maxStep = dataset.metadata.steps - 1;
    const timer = window.setInterval(() => {
      setStep((prev) => (prev >= maxStep ? 0 : prev + 1));
    }, playbackMs);

    return () => window.clearInterval(timer);
  }, [dataset, isPlaying, playbackMs]);

  useEffect(() => {
    return () => {
      cleanupDatasetResources(dataset);
      disposeAttentionWorker();
    };
  }, [dataset]);

  const topTokens = useMemo(() => {
    if (!dataset) {
      return [];
    }

    const ranking = dataset.metrics?.token_dominance?.ranking || [];
    const tokens = dataset.metadata.prompt.tokens || [];
    const meaningfulCount = getMeaningfulTokenCount(dataset);
    return ranking
      .filter((entry) => entry.token_index < meaningfulCount)
      .slice(0, 8)
      .map((entry) => ({
        ...entry,
        token: formatToken(tokens[entry.token_index] || '') || '[special]'
      }));
  }, [dataset]);

  const previewFrames = useMemo(() => {
    if (!dataset) {
      return [];
    }

    const last = Math.max(0, dataset.metadata.steps - 1);
    const candidates = [0, Math.floor(last * 0.16), Math.floor(last * 0.33), Math.floor(last * 0.5), Math.floor(last * 0.66), Math.floor(last * 0.84), last];
    const uniqueSteps = Array.from(new Set(candidates));

    return uniqueSteps
      .map((previewStep) => ({
        step: previewStep,
        src: getImageSrc(dataset, previewStep)
      }))
      .filter((frame) => Boolean(frame.src));
  }, [dataset]);

  if (!dataset) {
    return (
      <main className="app-shell revamped">
        <header className="app-header boot">
          <div>
            <p className="eyebrow">Diffusion Systems View</p>
            <h1>Static Diffusion Visualizer</h1>
            <p className="prompt-text">Auto-detecting default dataset and preparing live playback.</p>
          </div>
          <button className="ghost-btn" onClick={() => setShowLoader((value) => !value)}>
            {showLoader ? 'Hide Loader' : 'Open Loader'}
          </button>
        </header>

        <section className="panel landing-preview flow-section">
          <div className="panel-title-row">
            <h2>Work Preview</h2>
            <span className="tiny-badge mono">offline-ready</span>
          </div>
          <div className="preview-grid ghost">
            {Array.from({ length: 7 }).map((_, index) => (
              <article key={index} className="preview-card ghost-card">
                <div className="ghost-media" />
                <div className="ghost-line" />
              </article>
            ))}
          </div>
        </section>

        {autoLoadStatus === 'booting' ? (
          <section className="panel boot-panel flow-section">
            <div className="pulse-dot" />
            <p>Scanning `{AUTO_DATASET_URL}` for a ready dataset...</p>
          </section>
        ) : null}

        {autoLoadStatus === 'failed' ? (
          <section className="panel warning-panel flow-section">
            <h2>Auto-load did not start</h2>
            <p className="warning-text">{autoLoadMessage || 'No dataset found at default path.'}</p>
          </section>
        ) : null}

        <section className="panel loader-host flow-section">
          {showLoader || autoLoadStatus !== 'ready' ? <DatasetLoader onDatasetLoaded={handleDatasetLoaded} /> : null}
          <LocalGenerationPanel onDatasetLoaded={handleDatasetLoaded} />
        </section>
      </main>
    );
  }

  const maxStep = dataset.metadata.steps - 1;
  const clampedStep = Math.min(step, maxStep);

  return (
    <main className="app-shell revamped">
      <header className="app-header">
        <div>
          <p className="eyebrow">Diffusion Systems View</p>
          <h1>Static Diffusion Visualizer</h1>
          <p className="prompt-text">{dataset.metadata.prompt.text}</p>
        </div>
        <div className="header-actions">
          <button className="ghost-btn" onClick={() => setIsPlaying((value) => !value)}>
            {isPlaying ? 'Pause Global' : 'Resume Global'}
          </button>
          <button className="ghost-btn" onClick={() => setShowLoader((value) => !value)}>
            {showLoader ? 'Hide Loader' : 'Load Dataset'}
          </button>
          <button className="ghost-btn" onClick={() => setShowCompare((value) => !value)}>
            {showCompare ? 'Hide Compare' : 'Compare Runs'}
          </button>
          <button className="danger-btn" onClick={handleClearDataset}>
            Reset
          </button>
        </div>
      </header>

      <section className="panel preview-rail flow-section">
        <div className="panel-title-row">
          <h2>Work Previews</h2>
          <span className="mono tiny-badge">live timeline</span>
        </div>
        <div className="preview-grid">
          {previewFrames.map((frame) => (
            <button
              key={frame.step}
              className={`preview-card ${frame.step === clampedStep ? 'active' : ''}`}
              onClick={() => setStep(frame.step)}
              title={`Jump to step ${frame.step}`}
            >
              <img src={frame.src} alt={`Preview step ${frame.step}`} />
              <span className="preview-step mono">step {frame.step}</span>
            </button>
          ))}
        </div>
      </section>

      {showLoader ? (
        <section className="panel loader-host floating flow-section">
          <DatasetLoader onDatasetLoaded={handleDatasetLoaded} />
          <LocalGenerationPanel onDatasetLoaded={handleDatasetLoaded} />
        </section>
      ) : null}

      {dataset.warnings?.length ? (
        <section className="panel warning-panel flow-section">
          <h2>Dataset Warnings</h2>
          {dataset.warnings.map((warning) => (
            <p key={warning} className="warning-text">
              {warning}
            </p>
          ))}
        </section>
      ) : null}

      <Suspense fallback={<div className="panel">Rendering panels...</div>}>
        <section className="panel-grid three-up flow-section">
          <DenoisingTimeline
            className="panel-enter panel-1"
            dataset={dataset}
            step={clampedStep}
            onStepChange={setStep}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((value) => !value)}
            playbackMs={playbackMs}
            onPlaybackMsChange={setPlaybackMs}
          />

          <AttentionExplorer className="panel-enter panel-2" dataset={dataset} step={clampedStep} isPlaying={isPlaying} />

          <LatentTrajectory className="panel-enter panel-3" dataset={dataset} step={clampedStep} onStepChange={setStep} />
        </section>

        <section className="panel metrics-ribbon flow-section">
          <div className="ribbon-title-row">
            <h2>Token Dominance Snapshot</h2>
            <button className="ghost-btn tiny" onClick={() => setShowAdvanced((value) => !value)}>
              {showAdvanced ? 'Hide Details' : 'Show Details'}
            </button>
          </div>
          <div className="token-rankings">
            {topTokens.map((entry) => (
              <div key={`${entry.token_index}-${entry.score}`} className="token-pill dark">
                <span>{entry.token_index}</span>
                <strong>{entry.token}</strong>
                <span>{entry.score.toFixed(5)}</span>
              </div>
            ))}
          </div>

          {showAdvanced ? (
            <div className="advanced-inline">
              <p>Shape validation: {dataset.metrics.shape_validation?.passed ? 'passed' : 'issues detected'}</p>
              <p>
                Current KL step drift:{' '}
                {dataset.metrics.attention_kl_divergence?.[clampedStep] == null
                  ? 'n/a'
                  : dataset.metrics.attention_kl_divergence[clampedStep].toFixed(6)}
              </p>
              <p>Frames: {dataset.metadata.steps}</p>
              <p>CFG: {dataset.metadata.generator?.cfg_scale ?? 'n/a'}</p>
            </div>
          ) : null}
        </section>

        {showCompare ? (
          <section className="compare-wrap flow-section">
            <ComparativeMode datasetA={dataset} step={clampedStep} />
          </section>
        ) : null}
      </Suspense>
    </main>
  );
}
