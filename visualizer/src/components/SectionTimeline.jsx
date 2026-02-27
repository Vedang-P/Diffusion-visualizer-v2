import { useMemo } from 'react';
import * as d3 from 'd3';
import { getImageSrc } from '../utils/datasetLoader';

function toSeries(values) {
  return (values || []).map((value) => (Number.isFinite(value) ? value : null));
}

function buildLinePath(values, step, width = 320, height = 90) {
  const series = toSeries(values);
  if (!series.length) {
    return { width, height, path: '', marker: null };
  }

  const finiteValues = series.filter((value) => value != null);
  const min = d3.min(finiteValues) ?? 0;
  const max = d3.max(finiteValues) ?? 1;
  const x = d3.scaleLinear().domain([0, series.length - 1]).range([0, width]);
  const y = d3.scaleLinear().domain([min, max]).nice().range([height, 0]);

  const line = d3
    .line()
    .defined((value) => value != null)
    .x((_, index) => x(index))
    .y((value) => y(value));

  const clampedStep = Math.max(0, Math.min(step, series.length - 1));
  const current = series[clampedStep];
  const marker = current == null ? null : { x: x(clampedStep), y: y(current), value: current };

  return {
    width,
    height,
    path: line(series) || '',
    marker
  };
}

function RunTimelineCard({ title, dataset, step }) {
  const image = getImageSrc(dataset, step);
  const latentLine = useMemo(() => buildLinePath(dataset.metrics.latent_l2_norm, step), [dataset, step]);
  const cosineLine = useMemo(() => buildLinePath(dataset.metrics.cosine_similarity_to_previous, step), [dataset, step]);

  return (
    <article className="run-card">
      <div className="run-card-header">
        <h3>{title}</h3>
        <span>Step {step.toString().padStart(3, '0')}</span>
      </div>
      <div className="run-image-wrap">{image ? <img src={image} alt={`${title} step ${step}`} /> : null}</div>

      <div className="mini-chart-grid">
        <div className="mini-chart">
          <p>Latent Norm</p>
          <svg width={latentLine.width} height={latentLine.height + 4}>
            <path d={latentLine.path} className="chart-path" />
            {latentLine.marker ? <circle cx={latentLine.marker.x} cy={latentLine.marker.y} r={3.2} className="chart-marker" /> : null}
          </svg>
        </div>

        <div className="mini-chart">
          <p>Cosine Drift</p>
          <svg width={cosineLine.width} height={cosineLine.height + 4}>
            <path d={cosineLine.path} className="chart-path alt" />
            {cosineLine.marker ? <circle cx={cosineLine.marker.x} cy={cosineLine.marker.y} r={3.2} className="chart-marker" /> : null}
          </svg>
        </div>
      </div>
    </article>
  );
}

export default function SectionTimeline({ datasetA, datasetB, presetA, presetB, globalStep }) {
  return (
    <section className="story-section section-reveal">
      <div className="section-header">
        <p>01</p>
        <div>
          <h2>Denoising Timeline</h2>
          <p>Scrub the global slider and watch both latent trajectories reveal structure over the same denoising step.</p>
        </div>
      </div>

      <div className="run-grid two-up">
        <RunTimelineCard title={presetA.label} dataset={datasetA} step={globalStep} />
        <RunTimelineCard title={presetB.label} dataset={datasetB} step={globalStep} />
      </div>
    </section>
  );
}
