import { useMemo } from 'react';
import * as d3 from 'd3';
import { getImageSrc } from '../utils/datasetLoader';

function sanitizeSeries(values) {
  return (values || []).map((value) => (Number.isFinite(value) ? value : 0));
}

function buildSeries(values, step, width = 220, height = 64) {
  const safeValues = sanitizeSeries(values);
  if (!safeValues.length) {
    return {
      width,
      height,
      path: '',
      areaPath: '',
      markerX: 0,
      markerY: height,
      current: null,
      min: null,
      max: null
    };
  }

  const min = d3.min(safeValues) ?? 0;
  const max = d3.max(safeValues) ?? 1;
  const spread = Math.max(max - min, 1e-8);
  const domainMin = min - spread * 0.12;
  const domainMax = max + spread * 0.12;

  const x = d3.scaleLinear().domain([0, safeValues.length - 1]).range([0, width]);
  const y = d3.scaleLinear().domain([domainMin, domainMax]).range([height, 0]);

  const line = d3
    .line()
    .x((_, index) => x(index))
    .y((value) => y(value))
    .curve(d3.curveCatmullRom.alpha(0.5));

  const area = d3
    .area()
    .x((_, index) => x(index))
    .y0(height)
    .y1((value) => y(value))
    .curve(d3.curveCatmullRom.alpha(0.5));

  const clamped = Math.min(Math.max(step, 0), safeValues.length - 1);
  return {
    width,
    height,
    path: line(safeValues) || '',
    areaPath: area(safeValues) || '',
    markerX: x(clamped),
    markerY: y(safeValues[clamped]),
    current: safeValues[clamped],
    min,
    max
  };
}

function formatMetric(value, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function MetricCard({ label, chart, tone = 'a' }) {
  return (
    <article className="metric-card">
      <header>
        <span>{label}</span>
        <strong>{formatMetric(chart.current, label === 'Latent Norm' ? 2 : 5)}</strong>
      </header>
      <svg width={chart.width} height={chart.height + 2} className={`metric-line tone-${tone}`}>
        <path d={chart.areaPath} />
        <path d={chart.path} className="line" />
        <circle cx={chart.markerX} cy={chart.markerY} r={3.6} className="marker" />
      </svg>
      <footer>
        <small>{formatMetric(chart.min, 3)}</small>
        <small>{formatMetric(chart.max, 3)}</small>
      </footer>
    </article>
  );
}

export default function DenoisingTimeline({
  dataset,
  step,
  onStepChange,
  isPlaying,
  onTogglePlay,
  playbackMs,
  onPlaybackMsChange,
  className = ''
}) {
  const maxStep = dataset.metadata.steps - 1;
  const imageSrc = getImageSrc(dataset, step);

  const latentSeries = useMemo(() => buildSeries(dataset.metrics.latent_l2_norm, step), [dataset, step]);
  const noiseSeries = useMemo(() => buildSeries(dataset.metrics.predicted_noise_l2_norm, step), [dataset, step]);
  const cosineSeries = useMemo(() => buildSeries(dataset.metrics.cosine_similarity_to_previous, step), [dataset, step]);
  const klSeries = useMemo(() => buildSeries(dataset.metrics.attention_kl_divergence, step), [dataset, step]);

  return (
    <section className={`panel denoise-panel ${className}`.trim()}>
      <div className="panel-title-row">
        <h2>Denoising Pulse</h2>
        <div className="step-chip">Step {step.toString().padStart(3, '0')}</div>
      </div>

      <div className="hero-frame-wrap">
        <div className="hero-frame-glow" />
        <div className="hero-frame">
          {imageSrc ? <img src={imageSrc} alt={`Step ${step}`} className={isPlaying ? 'is-playing' : ''} /> : null}
          <div className="hero-overlay-grid" />
        </div>
      </div>

      <div className="timeline-controls compact">
        <button onClick={onTogglePlay} className="primary-btn">
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min={0}
          max={maxStep}
          value={step}
          onChange={(event) => onStepChange(Number(event.target.value))}
          aria-label="Timestep"
        />
        <span className="mono">
          {step} / {maxStep}
        </span>
      </div>

      <div className="timeline-controls speed-control">
        <label className="mono" htmlFor="playback-speed">
          Speed
        </label>
        <input
          id="playback-speed"
          type="range"
          min={100}
          max={650}
          step={10}
          value={playbackMs}
          onChange={(event) => onPlaybackMsChange(Number(event.target.value))}
        />
        <span className="mono">{playbackMs} ms</span>
      </div>

      <div className="metric-grid">
        <MetricCard label="Latent Norm" chart={latentSeries} tone="a" />
        <MetricCard label="Noise Norm" chart={noiseSeries} tone="b" />
        <MetricCard label="Cosine Drift" chart={cosineSeries} tone="c" />
        <MetricCard label="KL Shift" chart={klSeries} tone="d" />
      </div>
    </section>
  );
}
