import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCrossTokenAttentionMap } from '../utils/attentionAccess';
import { getImageSrc } from '../utils/datasetLoader';

function formatValue(value, digits = 5) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'missing';
}

function drawHeatmap(canvas, map, shape, opacity) {
  if (!canvas || !map || !shape) {
    return;
  }

  const [height, width] = shape;
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;

  const context = offscreen.getContext('2d');
  const imageData = context.createImageData(width, height);

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < map.length; index += 1) {
    min = Math.min(min, map[index]);
    max = Math.max(max, map[index]);
  }

  const range = Math.max(max - min, 1e-8);
  for (let index = 0; index < map.length; index += 1) {
    const normalized = (map[index] - min) / range;
    const base = index * 4;
    imageData.data[base] = Math.floor(20 + 230 * normalized);
    imageData.data[base + 1] = Math.floor(120 + 90 * normalized);
    imageData.data[base + 2] = Math.floor(255 - 180 * normalized);
    imageData.data[base + 3] = Math.floor(255 * normalized * opacity);
  }

  context.putImageData(imageData, 0, 0);

  const output = canvas.getContext('2d');
  output.clearRect(0, 0, canvas.width, canvas.height);
  output.imageSmoothingEnabled = true;
  output.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
}

function AttentionCard({ title, dataset, step, mapData, layerId, tokenIndex, tokenLabel, opacity }) {
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const imageSrc = getImageSrc(dataset, step);

  const crossEntropy = dataset.metrics.cross_attention_entropy?.[step]?.by_layer?.[layerId];
  const tokenActivation = dataset.metrics.mean_token_activation?.[step]?.[tokenIndex];

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || !mapData) {
      return;
    }

    const render = () => {
      canvas.width = image.clientWidth;
      canvas.height = image.clientHeight;
      drawHeatmap(canvas, mapData.map, mapData.shape, opacity);
    };

    if (image.complete) {
      render();
    }

    image.addEventListener('load', render);
    window.addEventListener('resize', render);
    return () => {
      image.removeEventListener('load', render);
      window.removeEventListener('resize', render);
    };
  }, [mapData, opacity, imageSrc]);

  return (
    <article className="run-card">
      <div className="run-card-header">
        <h3>{title}</h3>
        <span>{layerId}</span>
      </div>
      <div className="attention-stage">
        {imageSrc ? <img ref={imageRef} src={imageSrc} alt={`${title} attention`} /> : null}
        <canvas ref={canvasRef} />
      </div>
      <div className="stat-row">
        <p>
          Token: <strong>{tokenLabel}</strong>
        </p>
        <p>
          Entropy: <strong>{formatValue(crossEntropy)}</strong>
        </p>
        <p>
          Activation: <strong>{formatValue(tokenActivation, 6)}</strong>
        </p>
      </div>
    </article>
  );
}

export default function SectionAttention({
  datasetA,
  datasetB,
  presetA,
  presetB,
  globalStep,
  selectedLayer,
  selectedTokenIndex,
  attentionOpacity,
  tokenOptions
}) {
  const [mapA, setMapA] = useState(null);
  const [mapB, setMapB] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const tokenLabel = useMemo(() => tokenOptions[selectedTokenIndex] || '[special]', [tokenOptions, selectedTokenIndex]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedLayer) {
        setMapA(null);
        setMapB(null);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const [nextA, nextB] = await Promise.all([
          loadCrossTokenAttentionMap(datasetA, selectedLayer, globalStep, selectedTokenIndex),
          loadCrossTokenAttentionMap(datasetB, selectedLayer, globalStep, selectedTokenIndex)
        ]);

        if (!cancelled) {
          setMapA(nextA);
          setMapB(nextB);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : String(requestError));
          setMapA(null);
          setMapB(null);
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
        <p>02</p>
        <div>
          <h2>Attention Dynamics</h2>
          <p>Cross-attention maps are decoded per-step in the worker and overlaid to expose token-level focus migration.</p>
        </div>
      </div>

      <div className="run-grid two-up">
        <AttentionCard
          title={presetA.label}
          dataset={datasetA}
          step={globalStep}
          mapData={mapA}
          layerId={selectedLayer}
          tokenIndex={selectedTokenIndex}
          tokenLabel={tokenLabel}
          opacity={attentionOpacity}
        />
        <AttentionCard
          title={presetB.label}
          dataset={datasetB}
          step={globalStep}
          mapData={mapB}
          layerId={selectedLayer}
          tokenIndex={selectedTokenIndex}
          tokenLabel={tokenLabel}
          opacity={attentionOpacity}
        />
      </div>

      {loading ? <p className="helper">Decoding attention tiles...</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
