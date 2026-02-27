import { useMemo } from 'react';
import FrameCanvas from '../ui/FrameCanvas';

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

export default function MetricsScrubberSection({
  sectionRef,
  ready,
  step,
  maxStep,
  traceAFrame,
  traceBFrame,
  metricsDataset,
  onScrubStep
}) {
  const ranges = useMemo(() => {
    const metrics = metricsDataset?.metrics || {};
    return METRIC_CONFIG.reduce((accumulator, config) => {
      accumulator[config.key] = getRange(metrics[config.key]);
      return accumulator;
    }, {});
  }, [metricsDataset]);

  const metrics = metricsDataset?.metrics || {};

  return (
    <section ref={sectionRef} className="section section-metrics">
      <div className="metrics-layout">
        <div className="metrics-visuals">
          <div className="metrics-visual-header">
            <p className="section-overline">Interactive Inspection</p>
            <h2>Scrub timesteps to inspect trace behavior.</h2>
          </div>
          <div className="metrics-frame-stack">
            <div className="metrics-frame-card">{traceAFrame ? <FrameCanvas src={traceAFrame} alt={`Trace A at step ${step}`} /> : null}</div>
            <div className="metrics-frame-card">{traceBFrame ? <FrameCanvas src={traceBFrame} alt={`Trace B at step ${step}`} /> : null}</div>
          </div>
        </div>

        <aside className="metrics-panel">
          <div className="scrubber-block">
            <label htmlFor="step-scrubber">Step scrubber</label>
            <input
              id="step-scrubber"
              type="range"
              min={0}
              max={maxStep}
              value={step}
              disabled={!ready}
              onChange={(event) => onScrubStep(Number(event.target.value))}
            />
            <p>
              Step {step} / {maxStep}
            </p>
          </div>

          <div className="metric-card-grid">
            {METRIC_CONFIG.map((config) => (
              <MetricCard
                key={config.key}
                label={config.label}
                value={metrics?.[config.key]?.[step]}
                digits={config.digits}
                range={ranges[config.key] || { min: 0, max: 1 }}
              />
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
