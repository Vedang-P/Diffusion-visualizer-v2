import { useEffect, useMemo, useState } from 'react';
import FrameCanvas from '../ui/FrameCanvas';
import { getImageSrc } from '../../utils/datasetLoader';

const METRIC_CONFIG = [
  { key: 'latent_l2_norm', label: 'Latent norm', digits: 3 },
  { key: 'predicted_noise_l2_norm', label: 'Noise norm', digits: 3 },
  { key: 'cosine_similarity_to_previous', label: 'Cosine drift', digits: 6 },
  { key: 'attention_kl_divergence', label: 'KL shift', digits: 6 }
];

function toFinite(value) {
  return Number.isFinite(value) ? value : null;
}

function formatValue(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'missing';
}

function getRange(values) {
  const valid = (values || []).filter(Number.isFinite);
  if (valid.length === 0) {
    return { min: 0, max: 1 };
  }
  return {
    min: Math.min(...valid),
    max: Math.max(...valid)
  };
}

function MetricCard({ label, value, digits, range }) {
  const numeric = toFinite(value);
  const span = range.max - range.min;
  const progress = numeric === null || span <= 0 ? 0 : (numeric - range.min) / span;

  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{formatValue(numeric, digits)}</p>
      <div className="metric-bar">
        <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
      </div>
    </article>
  );
}

function clampStep(value, maxStep) {
  return Math.max(0, Math.min(maxStep, Math.floor(value)));
}

function normalizeValues(values, maxStep) {
  const sampled = Array.from({ length: maxStep + 1 }, (_, index) => {
    const value = values?.[index];
    return Number.isFinite(value) ? value : null;
  });
  const valid = sampled.filter((value) => value !== null);

  if (valid.length === 0) {
    return sampled;
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min;

  if (span <= 0) {
    return sampled.map((value) => (value === null ? null : 0.5));
  }

  return sampled.map((value) => (value === null ? null : (value - min) / span));
}

function buildLinePath(values, width, height, padding) {
  if (!values || values.length === 0) {
    return '';
  }

  const xRange = Math.max(1, width - padding * 2);
  const yRange = Math.max(1, height - padding * 2);
  const denominator = Math.max(1, values.length - 1);
  let path = '';
  let active = false;

  values.forEach((value, index) => {
    if (value === null) {
      active = false;
      return;
    }

    const x = padding + (index / denominator) * xRange;
    const y = padding + (1 - value) * yRange;
    path += `${active ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `;
    active = true;
  });

  return path.trim();
}

function StepTrendPlot({ title, series, currentStep, maxStep }) {
  const width = 330;
  const height = 132;
  const padding = 12;
  const xRange = Math.max(1, width - padding * 2);
  const guideX = padding + (Math.max(0, Math.min(maxStep, currentStep)) / Math.max(1, maxStep)) * xRange;

  const computed = useMemo(
    () =>
      series.map((entry) => {
        const normalized = normalizeValues(entry.values, maxStep);
        const path = buildLinePath(normalized, width, height, padding);
        const markerValue = normalized[currentStep] ?? null;
        const markerY = markerValue === null ? null : padding + (1 - markerValue) * (height - padding * 2);

        return {
          ...entry,
          path,
          markerY
        };
      }),
    [series, currentStep, maxStep]
  );

  return (
    <article className="trend-plot-card">
      <div className="trend-plot-header">
        <p>{title}</p>
        <span>Step {currentStep}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-plot-svg" role="img" aria-label={title}>
        <line className="trend-grid-line" x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        <line className="trend-grid-line trend-grid-line-mid" x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} />
        <line className="trend-guide-line" x1={guideX} y1={padding} x2={guideX} y2={height - padding} />
        {computed.map((entry) =>
          entry.path ? <path key={`${title}-${entry.label}`} d={entry.path} className="trend-line" style={{ '--trend-color': entry.color }} /> : null
        )}
        {computed.map((entry) =>
          entry.markerY === null ? null : (
            <circle
              key={`${title}-${entry.label}-marker`}
              cx={guideX}
              cy={entry.markerY}
              r="3.2"
              className="trend-marker"
              style={{ '--trend-color': entry.color }}
            />
          )
        )}
      </svg>
      <div className="trend-legend">
        {computed.map((entry) => (
          <span key={`${title}-${entry.label}-legend`}>
            <i style={{ '--trend-color': entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
    </article>
  );
}

function InspectionCard({ id, label, dataset, step, onStepChange, disabled }) {
  const maxStep = Math.max(0, (dataset?.metadata?.steps || 1) - 1);
  const currentStep = clampStep(step, maxStep);
  const metrics = dataset?.metrics || {};
  const frameSrc = dataset ? getImageSrc(dataset, currentStep) : '';

  const ranges = useMemo(
    () =>
      METRIC_CONFIG.reduce((accumulator, config) => {
        accumulator[config.key] = getRange(metrics[config.key]);
        return accumulator;
      }, {}),
    [metrics]
  );

  return (
    <article className="inspection-card">
      <div className="inspection-visual">
        <header className="inspection-visual-header">
          <h3>{label}</h3>
          <span>
            Step {currentStep} / {maxStep}
          </span>
        </header>
        <div className="inspection-frame-card">
          {frameSrc ? <FrameCanvas src={frameSrc} alt={`${label} at step ${currentStep}`} /> : <div className="trace-panel-placeholder">no frame</div>}
        </div>
      </div>

      <aside className="inspection-panel">
        <div className="scrubber-block">
          <label htmlFor={`${id}-step-scrubber`}>Step</label>
          <input
            id={`${id}-step-scrubber`}
            type="range"
            min={0}
            max={maxStep}
            value={currentStep}
            disabled={disabled || !dataset}
            onChange={(event) => onStepChange(Number(event.target.value))}
          />
          <p>
            Step {currentStep} / {maxStep}
          </p>
        </div>

        <div className="trend-plot-grid">
          <StepTrendPlot
            title="Denoising Magnitude"
            currentStep={currentStep}
            maxStep={maxStep}
            series={[
              {
                label: 'Latent',
                color: '#67b0ff',
                values: metrics?.latent_l2_norm || []
              },
              {
                label: 'Noise',
                color: '#4be07f',
                values: metrics?.predicted_noise_l2_norm || []
              }
            ]}
          />
          <StepTrendPlot
            title="Stability Signals"
            currentStep={currentStep}
            maxStep={maxStep}
            series={[
              {
                label: 'Cosine',
                color: '#c9a8ff',
                values: metrics?.cosine_similarity_to_previous || []
              },
              {
                label: 'KL',
                color: '#ffbf7b',
                values: metrics?.attention_kl_divergence || []
              }
            ]}
          />
        </div>

        <div className="metric-card-grid">
          {METRIC_CONFIG.map((config) => (
            <MetricCard
              key={`${id}-${config.key}`}
              label={config.label}
              value={metrics?.[config.key]?.[currentStep]}
              digits={config.digits}
              range={ranges[config.key] || { min: 0, max: 1 }}
            />
          ))}
        </div>
      </aside>
    </article>
  );
}

export default function MetricsScrubberSection({
  sectionRef,
  ready,
  initialStep,
  realisticDataset,
  animeDataset
}) {
  const [realisticStep, setRealisticStep] = useState(initialStep || 0);
  const [animeStep, setAnimeStep] = useState(initialStep || 0);

  useEffect(() => {
    const maxRealistic = Math.max(0, (realisticDataset?.metadata?.steps || 1) - 1);
    const maxAnime = Math.max(0, (animeDataset?.metadata?.steps || 1) - 1);

    setRealisticStep((previous) => clampStep(previous, maxRealistic));
    setAnimeStep((previous) => clampStep(previous, maxAnime));
  }, [realisticDataset, animeDataset]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const maxRealistic = Math.max(0, (realisticDataset?.metadata?.steps || 1) - 1);
    const maxAnime = Math.max(0, (animeDataset?.metadata?.steps || 1) - 1);
    const syncedStep = clampStep(initialStep || 0, Math.min(maxRealistic, maxAnime));

    setRealisticStep((previous) => (previous === 0 ? syncedStep : previous));
    setAnimeStep((previous) => (previous === 0 ? syncedStep : previous));
  }, [ready, initialStep, realisticDataset, animeDataset]);

  return (
    <section ref={sectionRef} className="section section-metrics">
      <div className="section-header section-header-metrics">
        <h2>From Noise to Structure.</h2>
        <p className="section-playback-subtext section-metrics-subtext">
          Move through the reverse diffusion process and observe how global layout forms before fine detail is refined. As noise is
          iteratively removed, high-level semantic structure stabilizes first, followed by localized texture, edges, and lighting
          corrections in the final timesteps.
        </p>
      </div>

      <div className="metrics-card-stack">
        <InspectionCard
          id="realistic"
          label={realisticDataset?.preset?.shortLabel || 'Realistic'}
          dataset={realisticDataset}
          step={realisticStep}
          onStepChange={setRealisticStep}
          disabled={!ready}
        />
        <InspectionCard
          id="anime"
          label={animeDataset?.preset?.shortLabel || 'Anime'}
          dataset={animeDataset}
          step={animeStep}
          onStepChange={setAnimeStep}
          disabled={!ready}
        />
      </div>
    </section>
  );
}
