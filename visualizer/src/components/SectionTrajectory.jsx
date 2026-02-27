import { useMemo } from 'react';
import * as d3 from 'd3';

function buildTrajectory(points, step, width = 360, height = 260) {
  if (!points?.length) {
    return { width, height, path: '', points: [] };
  }

  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);

  const x = d3.scaleLinear().domain(d3.extent(xs)).nice().range([16, width - 16]);
  const y = d3.scaleLinear().domain(d3.extent(ys)).nice().range([height - 16, 16]);

  const line = d3
    .line()
    .x((point) => x(point[0]))
    .y((point) => y(point[1]))
    .curve(d3.curveNatural);

  return {
    width,
    height,
    path: line(points) || '',
    points: points.map((point, index) => ({
      step: index,
      x: x(point[0]),
      y: y(point[1]),
      active: index === step
    }))
  };
}

function buildEntropyPath(items, width = 320, height = 80) {
  const values = (items || []).map((entry) => (Number.isFinite(entry?.mean) ? entry.mean : null));
  if (!values.length) {
    return { width, height, path: '' };
  }

  const finiteValues = values.filter((value) => value != null);
  const min = d3.min(finiteValues) ?? 0;
  const max = d3.max(finiteValues) ?? 1;
  const x = d3.scaleLinear().domain([0, values.length - 1]).range([0, width]);
  const y = d3.scaleLinear().domain([min, max]).nice().range([height, 0]);

  const line = d3
    .line()
    .defined((value) => value != null)
    .x((_, index) => x(index))
    .y((value) => y(value));

  return { width, height, path: line(values) || '' };
}

function formatValue(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'missing';
}

function TrajectoryCard({ title, dataset, step }) {
  const trajectory = useMemo(() => buildTrajectory(dataset.latentPca.points || [], step), [dataset, step]);
  const crossEntropy = useMemo(() => buildEntropyPath(dataset.metrics.cross_attention_entropy), [dataset]);
  const selfEntropy = useMemo(() => buildEntropyPath(dataset.metrics.self_attention_entropy), [dataset]);

  const cosineDrift = dataset.metrics.cosine_similarity_to_previous?.[step];
  const klShift = dataset.metrics.attention_kl_divergence?.[step];
  const explained = dataset.latentPca.explained_variance_ratio || [];

  return (
    <article className="run-card">
      <div className="run-card-header">
        <h3>{title}</h3>
        <span>PCA 2D</span>
      </div>

      <svg width={trajectory.width} height={trajectory.height} className="trajectory-svg">
        <path d={trajectory.path} className="trajectory-path" />
        {trajectory.points.map((point) => (
          <circle
            key={point.step}
            cx={point.x}
            cy={point.y}
            r={point.active ? 4.4 : 2.1}
            className={point.active ? 'trajectory-point active' : 'trajectory-point'}
          />
        ))}
      </svg>

      <div className="mini-chart-grid">
        <div className="mini-chart">
          <p>Cross Entropy Mean</p>
          <svg width={crossEntropy.width} height={crossEntropy.height + 4}>
            <path d={crossEntropy.path} className="chart-path" />
          </svg>
        </div>
        <div className="mini-chart">
          <p>Self Entropy Mean</p>
          <svg width={selfEntropy.width} height={selfEntropy.height + 4}>
            <path d={selfEntropy.path} className="chart-path alt" />
          </svg>
        </div>
      </div>

      <div className="stat-row">
        <p>
          Cosine Drift: <strong>{formatValue(cosineDrift)}</strong>
        </p>
        <p>
          KL Shift: <strong>{formatValue(klShift)}</strong>
        </p>
        <p>
          Explained Variance: <strong>{explained.map((value) => value.toFixed(3)).join(' · ') || 'n/a'}</strong>
        </p>
      </div>
    </article>
  );
}

export default function SectionTrajectory({ datasetA, datasetB, presetA, presetB, globalStep }) {
  return (
    <section className="story-section section-reveal">
      <div className="section-header">
        <p>03</p>
        <div>
          <h2>Latent Trajectory</h2>
          <p>Both runs project latent states into shared PCA coordinates to expose geometric divergence through denoising.</p>
        </div>
      </div>

      <div className="run-grid two-up">
        <TrajectoryCard title={presetA.label} dataset={datasetA} step={globalStep} />
        <TrajectoryCard title={presetB.label} dataset={datasetB} step={globalStep} />
      </div>
    </section>
  );
}
