import { useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import DatasetLoader from '../components/DatasetLoader';
import { loadCrossTokenAttentionMap } from '../utils/attentionAccess';
import { computeAttentionDivergence, computeLatentTrajectoryDelta } from '../utils/comparison';
import { cleanupDatasetResources, getCrossLayerIds } from '../utils/datasetLoader';
import { getMeaningfulTokenCount } from '../utils/tokenUtils';

export default function ComparativeMode({ datasetA, step }) {
  const [datasetB, setDatasetB] = useState(null);
  const [layerId, setLayerId] = useState('');
  const [tokenIndex, setTokenIndex] = useState(0);
  const [divergence, setDivergence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDatasetBLoaded = (nextDataset) => {
    setDatasetB((previous) => {
      cleanupDatasetResources(previous);
      return nextDataset;
    });
  };

  const handleUnloadDatasetB = () => {
    setDatasetB((previous) => {
      cleanupDatasetResources(previous);
      return null;
    });
  };

  const layerIdsA = useMemo(() => getCrossLayerIds(datasetA), [datasetA]);
  const layerIdsB = useMemo(() => (datasetB ? getCrossLayerIds(datasetB) : []), [datasetB]);

  const sharedLayerIds = useMemo(() => {
    if (!datasetB) {
      return [];
    }
    const setB = new Set(layerIdsB);
    return layerIdsA.filter((id) => setB.has(id));
  }, [datasetB, layerIdsA, layerIdsB]);

  const maxTokenIndex = useMemo(() => {
    const meaningfulA = getMeaningfulTokenCount(datasetA);
    if (!datasetB) {
      return Math.max(0, meaningfulA - 1);
    }
    const meaningfulB = getMeaningfulTokenCount(datasetB);
    const count = Math.min(
      meaningfulA || 0,
      meaningfulB || 0
    );
    return Math.max(0, count - 1);
  }, [datasetA, datasetB]);

  useEffect(() => {
    return () => {
      cleanupDatasetResources(datasetB);
    };
  }, [datasetB]);

  useEffect(() => {
    if (!sharedLayerIds.length) {
      setLayerId('');
      return;
    }
    if (!sharedLayerIds.includes(layerId)) {
      setLayerId(sharedLayerIds[0]);
    }
  }, [layerId, sharedLayerIds]);

  useEffect(() => {
    if (tokenIndex > maxTokenIndex) {
      setTokenIndex(maxTokenIndex);
    }
  }, [maxTokenIndex, tokenIndex]);

  const latentDelta = useMemo(() => {
    if (!datasetB) {
      return [];
    }
    return computeLatentTrajectoryDelta(datasetA.latentPca.points || [], datasetB.latentPca.points || []);
  }, [datasetA, datasetB]);

  const latentDeltaChart = useMemo(() => {
    const width = 380;
    const height = 100;
    if (!latentDelta.length) {
      return { width, height, path: '' };
    }

    const x = d3.scaleLinear().domain([0, latentDelta.length - 1]).range([0, width]);
    const y = d3
      .scaleLinear()
      .domain([d3.min(latentDelta) || 0, d3.max(latentDelta) || 1])
      .nice()
      .range([height, 0]);

    const line = d3
      .line()
      .x((_, index) => x(index))
      .y((value) => y(value));

    return {
      width,
      height,
      path: line(latentDelta) || ''
    };
  }, [latentDelta]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!datasetB || !layerId) {
        setDivergence(null);
        return;
      }

      if (tokenIndex > maxTokenIndex) {
        setDivergence(null);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const [mapA, mapB] = await Promise.all([
          loadCrossTokenAttentionMap(datasetA, layerId, step, tokenIndex),
          loadCrossTokenAttentionMap(datasetB, layerId, step, tokenIndex)
        ]);

        if (!mapA || !mapB) {
          if (!cancelled) {
            setDivergence(null);
          }
          return;
        }

        const value = await computeAttentionDivergence(mapA.map, mapB.map);
        if (!cancelled) {
          setDivergence(value);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
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
  }, [datasetA, datasetB, layerId, maxTokenIndex, step, tokenIndex]);

  return (
    <div className="panel">
      <h2>Comparative Mode</h2>
      {!datasetB ? (
        <DatasetLoader label="Comparison Dataset" onDatasetLoaded={handleDatasetBLoaded} />
      ) : (
        <div className="compare-controls">
          <button onClick={handleUnloadDatasetB}>Unload Comparison Dataset</button>
          {!sharedLayerIds.length ? (
            <p className="warning-text">
              The two datasets do not share common cross-attention layer IDs. Compare runs generated with the same
              layer selection config.
            </p>
          ) : null}
          <label>
            Layer
            <select value={layerId} onChange={(event) => setLayerId(event.target.value)}>
              {sharedLayerIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Token
            <input
              type="number"
              min={0}
              max={maxTokenIndex}
              value={tokenIndex}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                const clamped = Math.min(maxTokenIndex, Math.max(0, Math.floor(parsed)));
                setTokenIndex(clamped);
              }}
            />
          </label>
          <p>
            Attention JS divergence (step {step}):{' '}
            {loading ? 'computing...' : divergence == null ? 'n/a' : divergence.toFixed(6)}
          </p>
          <div>
            <p>Latent trajectory delta (Euclidean distance in PCA space)</p>
            <svg width={latentDeltaChart.width} height={latentDeltaChart.height + 8}>
              <g transform="translate(0,4)">
                <path d={latentDeltaChart.path} fill="none" stroke="var(--accent-2)" strokeWidth={2} />
              </g>
            </svg>
            <p>Current step delta: {latentDelta[step] == null ? 'n/a' : latentDelta[step].toFixed(6)}</p>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
