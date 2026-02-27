import { useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { loadCrossTokenAttentionMap } from '../utils/attentionAccess';
import { computeAttentionDivergence, computeLatentTrajectoryDelta } from '../utils/comparison';

function buildLine(values, step, width = 760, height = 120) {
  if (!values.length) {
    return { width, height, path: '', marker: null };
  }

  const x = d3.scaleLinear().domain([0, values.length - 1]).range([0, width]);
  const y = d3.scaleLinear().domain([d3.min(values) ?? 0, d3.max(values) ?? 1]).nice().range([height, 0]);

  const line = d3
    .line()
    .x((_, index) => x(index))
    .y((value) => y(value));

  const clampedStep = Math.min(values.length - 1, Math.max(0, step));
  return {
    width,
    height,
    path: line(values) || '',
    marker: {
      x: x(clampedStep),
      y: y(values[clampedStep]),
      value: values[clampedStep]
    }
  };
}

export default function SectionComparison({ datasetA, datasetB, globalStep, selectedLayer, selectedTokenIndex }) {
  const [divergence, setDivergence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const latentDelta = useMemo(
    () => computeLatentTrajectoryDelta(datasetA.latentPca.points || [], datasetB.latentPca.points || []),
    [datasetA, datasetB]
  );
  const latentDeltaChart = useMemo(() => buildLine(latentDelta, globalStep), [latentDelta, globalStep]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedLayer) {
        setDivergence(null);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const [mapA, mapB] = await Promise.all([
          loadCrossTokenAttentionMap(datasetA, selectedLayer, globalStep, selectedTokenIndex),
          loadCrossTokenAttentionMap(datasetB, selectedLayer, globalStep, selectedTokenIndex)
        ]);

        const value = await computeAttentionDivergence(mapA?.map, mapB?.map);
        if (!cancelled) {
          setDivergence(value);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : String(requestError));
          setDivergence(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [datasetA, datasetB, globalStep, selectedLayer, selectedTokenIndex]);

  return (
    <section className="story-section section-reveal">
      <div className="section-header">
        <p>04</p>
        <div>
          <h2>Synchronized Comparison</h2>
          <p>Step-locked comparison quantifies spatial attention divergence and latent path separation in the same frame.</p>
        </div>
      </div>

      <article className="compare-panel">
        <div className="compare-headline">
          <p>
            Attention JS Divergence: <strong>{loading ? 'computing...' : divergence == null ? 'n/a' : divergence.toFixed(6)}</strong>
          </p>
          <p>
            Current Latent Delta: <strong>{latentDelta[globalStep] == null ? 'n/a' : latentDelta[globalStep].toFixed(6)}</strong>
          </p>
        </div>

        <svg width={latentDeltaChart.width} height={latentDeltaChart.height + 8} className="comparison-chart">
          <g transform="translate(0,4)">
            <path d={latentDeltaChart.path} className="chart-path compare" />
            {latentDeltaChart.marker ? (
              <circle cx={latentDeltaChart.marker.x} cy={latentDeltaChart.marker.y} r={4} className="chart-marker" />
            ) : null}
          </g>
        </svg>

        <p className="helper">Latent trajectory delta is Euclidean distance in 2D PCA space.</p>
        {error ? <p className="error">{error}</p> : null}
      </article>
    </section>
  );
}
