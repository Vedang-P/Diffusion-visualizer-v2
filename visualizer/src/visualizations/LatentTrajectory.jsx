import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import { getImageSrc } from '../utils/datasetLoader';

function sanitizeSeries(values) {
  return (values || []).map((value) => (Number.isFinite(value) ? value : 0));
}

function buildLine(values, step, width = 330, height = 78) {
  const series = sanitizeSeries(values);
  if (!series.length) {
    return {
      width,
      height,
      path: '',
      markerX: 0,
      markerY: height,
      current: null
    };
  }

  const x = d3.scaleLinear().domain([0, series.length - 1]).range([0, width]);
  const y = d3
    .scaleLinear()
    .domain([d3.min(series) ?? 0, d3.max(series) ?? 1])
    .nice()
    .range([height, 0]);

  const line = d3
    .line()
    .x((_, index) => x(index))
    .y((value) => y(value))
    .curve(d3.curveMonotoneX);

  const clamped = Math.min(Math.max(step, 0), series.length - 1);
  return {
    width,
    height,
    path: line(series) || '',
    markerX: x(clamped),
    markerY: y(series[clamped]),
    current: series[clamped]
  };
}

function formatValue(value, digits = 5) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

export default function LatentTrajectory({ dataset, step, onStepChange, className = '' }) {
  const [hoverStep, setHoverStep] = useState(null);
  const points = dataset.latentPca.points || [];

  const chart = useMemo(() => {
    const width = 360;
    const height = 280;

    if (!points.length) {
      return { width, height, points: [], path: '' };
    }

    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);

    const x = d3.scaleLinear().domain(d3.extent(xs)).nice().range([18, width - 18]);
    const y = d3.scaleLinear().domain(d3.extent(ys)).nice().range([height - 18, 18]);

    const line = d3
      .line()
      .x((value) => x(value[0]))
      .y((value) => y(value[1]))
      .curve(d3.curveNatural);

    const projectedPoints = points.map((value, index) => ({
      step: index,
      x: x(value[0]),
      y: y(value[1])
    }));

    return {
      width,
      height,
      points: projectedPoints,
      path: line(points) || ''
    };
  }, [points]);

  const previewStep = hoverStep ?? step;
  const previewSrc = getImageSrc(dataset, previewStep);

  const crossEntropySeries = useMemo(
    () => buildLine((dataset.metrics.cross_attention_entropy || []).map((item) => item.mean), step),
    [dataset, step]
  );
  const selfEntropySeries = useMemo(
    () => buildLine((dataset.metrics.self_attention_entropy || []).map((item) => item.mean), step),
    [dataset, step]
  );

  const explainedVariance = dataset.latentPca.explained_variance_ratio || [];
  const cosineCurrent = dataset.metrics.cosine_similarity_to_previous?.[step];
  const klCurrent = dataset.metrics.attention_kl_divergence?.[step];

  return (
    <section className={`panel trajectory-panel ${className}`.trim()}>
      <div className="panel-title-row">
        <h2>Trajectory + Metrics</h2>
        <span className="mono tiny-badge">PCA-2D</span>
      </div>

      <div className="trajectory-layout compact">
        <svg width={chart.width} height={chart.height} className="trajectory-svg">
          <path d={chart.path} fill="none" stroke="var(--line-b)" strokeWidth={1.7} />
          {chart.points.map((point) => (
            <circle
              key={point.step}
              cx={point.x}
              cy={point.y}
              r={point.step === step ? 5.1 : 2.4}
              fill={point.step === step ? 'var(--line-c)' : 'var(--line-a)'}
              onMouseEnter={() => setHoverStep(point.step)}
              onMouseLeave={() => setHoverStep(null)}
              onClick={() => onStepChange(point.step)}
              className={`trajectory-point ${point.step === step ? 'active' : ''}`}
            />
          ))}
        </svg>
        <div className="trajectory-preview">
          <p className="mono">Preview {previewStep}</p>
          {previewSrc ? <img src={previewSrc} alt={`Preview step ${previewStep}`} /> : null}
          <div className="mini-stats">
            <article>
              <span>Explained Var</span>
              <strong>{explainedVariance.map((v) => v.toFixed(3)).join(' · ') || 'n/a'}</strong>
            </article>
            <article>
              <span>Cosine Drift</span>
              <strong>{formatValue(cosineCurrent, 6)}</strong>
            </article>
            <article>
              <span>KL Shift</span>
              <strong>{formatValue(klCurrent, 6)}</strong>
            </article>
          </div>
        </div>
      </div>

      <div className="dual-metrics">
        <article>
          <header>
            <span>Cross Entropy</span>
            <strong>{formatValue(crossEntropySeries.current, 5)}</strong>
          </header>
          <svg width={crossEntropySeries.width} height={crossEntropySeries.height + 2} className="metric-line tone-a">
            <path d={crossEntropySeries.path} className="line" />
            <circle cx={crossEntropySeries.markerX} cy={crossEntropySeries.markerY} r={3.5} className="marker" />
          </svg>
        </article>

        <article>
          <header>
            <span>Self Entropy</span>
            <strong>{formatValue(selfEntropySeries.current, 5)}</strong>
          </header>
          <svg width={selfEntropySeries.width} height={selfEntropySeries.height + 2} className="metric-line tone-c">
            <path d={selfEntropySeries.path} className="line" />
            <circle cx={selfEntropySeries.markerX} cy={selfEntropySeries.markerY} r={3.5} className="marker" />
          </svg>
        </article>
      </div>
    </section>
  );
}
