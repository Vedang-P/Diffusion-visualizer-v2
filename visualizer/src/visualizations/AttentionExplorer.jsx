import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCrossTokenAttentionMap } from '../utils/attentionAccess';
import { getImageSrc, getCrossLayerIds } from '../utils/datasetLoader';
import { getMeaningfulTokenCount, normalizeToken } from '../utils/tokenUtils';

function cleanToken(token) {
  return normalizeToken(token);
}

function drawHeatmap(canvas, map, shape) {
  const [height, width] = shape;
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;

  const ctx = offscreen.getContext('2d');
  const imageData = ctx.createImageData(width, height);

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < map.length; i += 1) {
    min = Math.min(min, map[i]);
    max = Math.max(max, map[i]);
  }
  const range = Math.max(max - min, 1e-8);

  for (let i = 0; i < map.length; i += 1) {
    const normalized = (map[i] - min) / range;
    const base = i * 4;
    imageData.data[base] = Math.floor(18 + 220 * normalized);
    imageData.data[base + 1] = Math.floor(120 + 110 * normalized);
    imageData.data[base + 2] = Math.floor(250 - 160 * normalized);
    imageData.data[base + 3] = Math.floor(180 * normalized);
  }
  ctx.putImageData(imageData, 0, 0);

  const outputCtx = canvas.getContext('2d');
  outputCtx.clearRect(0, 0, canvas.width, canvas.height);
  outputCtx.imageSmoothingEnabled = true;
  outputCtx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
}

export default function AttentionExplorer({ dataset, step, isPlaying, className = '' }) {
  const layerIds = useMemo(() => getCrossLayerIds(dataset), [dataset]);
  const [layerId, setLayerId] = useState(layerIds[0] || '');
  const [tokenIndex, setTokenIndex] = useState(0);
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const imageSrc = getImageSrc(dataset, step);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  const allTokens = dataset.metadata.prompt.tokens || [];
  const meaningfulTokenCount = getMeaningfulTokenCount(dataset);
  const tokens = allTokens.slice(0, meaningfulTokenCount);
  const maxTokenIndex = Math.max(0, tokens.length - 1);
  const entropyData = dataset.metrics.cross_attention_entropy?.[step]?.by_layer || {};
  const entropy = entropyData[layerId] ?? null;
  const tokenActivation = dataset.metrics.mean_token_activation?.[step]?.[tokenIndex] ?? null;

  const activationRow = dataset.metrics.mean_token_activation?.[step] || [];
  const topTokens = useMemo(() => {
    const ranked = activationRow
      .map((score, index) => ({ index, score: Number.isFinite(score) ? score : 0 }))
      .filter((entry) => entry.index < meaningfulTokenCount)
      .sort((a, b) => b.score - a.score)
      .slice(0, 7);

    const max = ranked[0]?.score || 1;
    return ranked.map((entry) => ({
      ...entry,
      token: cleanToken(allTokens[entry.index]) || '[special]',
      ratio: max > 0 ? entry.score / max : 0
    }));
  }, [activationRow, allTokens, meaningfulTokenCount]);

  useEffect(() => {
    if (!layerIds.includes(layerId)) {
      setLayerId(layerIds[0] || '');
    }
  }, [layerId, layerIds]);

  useEffect(() => {
    if (tokenIndex > maxTokenIndex) {
      setTokenIndex(maxTokenIndex);
    }
  }, [maxTokenIndex, tokenIndex]);

  useEffect(() => {
    if (!isPlaying || tokens.length <= 1) {
      return undefined;
    }

    const handle = window.setInterval(() => {
      setTokenIndex((prev) => (prev + 1) % Math.max(1, Math.min(tokens.length, 24)));
    }, 1500);

    return () => window.clearInterval(handle);
  }, [isPlaying, tokens.length]);

  useEffect(() => {
    let cancelled = false;
    if (!dataset || !layerId || tokens.length === 0) {
      setMapData(null);
      return undefined;
    }

    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const attention = await loadCrossTokenAttentionMap(dataset, layerId, step, tokenIndex);
        if (!cancelled) {
          setMapData(attention);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setMapData(null);
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
  }, [dataset, layerId, step, tokenIndex, tokens.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !mapData) {
      return;
    }

    const resizeAndDraw = () => {
      canvas.width = image.clientWidth;
      canvas.height = image.clientHeight;
      drawHeatmap(canvas, mapData.map, mapData.shape);
    };

    if (image.complete) {
      resizeAndDraw();
    }
    image.addEventListener('load', resizeAndDraw);
    window.addEventListener('resize', resizeAndDraw);
    return () => {
      image.removeEventListener('load', resizeAndDraw);
      window.removeEventListener('resize', resizeAndDraw);
    };
  }, [mapData, imageSrc]);

  return (
    <section className={`panel attention-panel ${className}`.trim()}>
      <div className="panel-title-row">
        <h2>Attention Atlas</h2>
        <div className="mono tiny-badge">{layerId || 'no-layer'}</div>
      </div>

      {!layerIds.length ? <p className="warning-text">No cross-attention layers are available in this dataset.</p> : null}

      <div className="attention-controls compact">
        <label>
          Layer
          <select value={layerId} onChange={(event) => setLayerId(event.target.value)}>
            {layerIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Token
          <select value={tokenIndex} onChange={(event) => setTokenIndex(Number(event.target.value))}>
            {tokens.map((token, index) => (
              <option value={index} key={`${token}-${index}`}>
                [{index}] {cleanToken(token) || '[special]'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="attention-stat-row">
        <article>
          <span>Entropy</span>
          <strong>{entropy == null ? 'n/a' : entropy.toFixed(5)}</strong>
        </article>
        <article>
          <span>Token Activation</span>
          <strong>{tokenActivation == null ? 'n/a' : tokenActivation.toFixed(6)}</strong>
        </article>
      </div>

      <div className="attention-overlay-wrap modern">
        <div className="attention-glow" />
        {imageSrc ? <img ref={imageRef} src={imageSrc} alt={`Step ${step}`} className={isPlaying ? 'is-playing' : ''} /> : null}
        <canvas ref={canvasRef} className="attention-canvas" />
        {loading ? <div className="overlay-note">streaming maps...</div> : null}
      </div>

      <div className="token-bars">
        {topTokens.map((entry) => (
          <div key={`${entry.index}-${entry.score}`} className="token-bar-row">
            <span className="mono">[{entry.index}]</span>
            <span className="token-label" title={entry.token}>
              {entry.token}
            </span>
            <div className="token-bar-track">
              <div className="token-bar-fill" style={{ width: `${Math.max(2, entry.ratio * 100)}%` }} />
            </div>
            <span className="mono">{entry.score.toFixed(4)}</span>
          </div>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
