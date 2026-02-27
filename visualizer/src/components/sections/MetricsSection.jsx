import FlickeringGrid from '../ui/FlickeringGrid';

function formatValue(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'missing';
}

function safeMetric(values, step) {
  if (!Array.isArray(values)) {
    return null;
  }
  const value = values[step];
  return Number.isFinite(value) ? value : null;
}

function topTokenInfo(dataset) {
  const ranking = dataset?.metrics?.token_dominance?.ranking || [];
  const top = ranking[0];
  if (!top) {
    return { token: 'n/a', score: null };
  }

  const token = dataset?.metadata?.prompt?.tokens?.[top.token_index] || '[special]';
  return {
    token,
    score: Number.isFinite(top.score) ? top.score : null
  };
}

function MetricPanel({ label, dataset, step }) {
  const latent = safeMetric(dataset.metrics.latent_l2_norm, step);
  const noise = safeMetric(dataset.metrics.predicted_noise_l2_norm, step);
  const cosine = safeMetric(dataset.metrics.cosine_similarity_to_previous, step);
  const kl = safeMetric(dataset.metrics.attention_kl_divergence, step);
  const entropy = safeMetric(
    (dataset.metrics.cross_attention_entropy || []).map((entry) => entry?.mean),
    step
  );

  const topToken = topTokenInfo(dataset);

  return (
    <article className="metric-panel">
      <header>
        <h3>{label}</h3>
        <span>Step {String(step).padStart(3, '0')}</span>
      </header>
      <dl>
        <div>
          <dt>Latent Norm</dt>
          <dd>{formatValue(latent, 3)}</dd>
        </div>
        <div>
          <dt>Noise Norm</dt>
          <dd>{formatValue(noise, 3)}</dd>
        </div>
        <div>
          <dt>Cosine Drift</dt>
          <dd>{formatValue(cosine)}</dd>
        </div>
        <div>
          <dt>KL Shift</dt>
          <dd>{formatValue(kl)}</dd>
        </div>
        <div>
          <dt>Cross Entropy Mean</dt>
          <dd>{formatValue(entropy)}</dd>
        </div>
        <div>
          <dt>Top Token</dt>
          <dd>{topToken.token}</dd>
        </div>
      </dl>
      <p className="token-score">Dominance score: {formatValue(topToken.score)}</p>
    </article>
  );
}

function InsightGridCard({ title, note, color }) {
  return (
    <article className="insight-grid-card">
      <FlickeringGrid className="insight-grid-background" squareSize={3} gridGap={6} color={color} maxOpacity={0.42} flickerChance={0.1} />
      <p>{title}</p>
      <span>{note}</span>
    </article>
  );
}

export default function MetricsSection({ ready, step, maxStep, onStepChange, realistic, anime }) {
  return (
    <section className="metrics-stage">
      <div className="metrics-head">
        <h2>Metrics</h2>
        <p>After the intro sequence, inspect synchronized run metrics and scrub the step manually.</p>
      </div>
      <div className="metrics-insight-strip">
        <InsightGridCard title="Latent Norm" note="Magnitude control over denoising" color="#8ea4c4" />
        <InsightGridCard title="KL Shift" note="Attention distribution divergence" color="#9d8ec4" />
        <InsightGridCard title="Token Dominance" note="Prompt influence concentration" color="#c49ea1" />
      </div>

      {ready ? (
        <>
          <div className="metrics-scrub">
            <input type="range" min={0} max={maxStep} value={step} onChange={(event) => onStepChange(Number(event.target.value))} />
            <span>
              Step {step} / {maxStep}
            </span>
          </div>
          <div className="metrics-grid">
            <MetricPanel label="Realistic Run" dataset={realistic} step={step} />
            <MetricPanel label="Anime Run" dataset={anime} step={step} />
          </div>
        </>
      ) : (
        <p className="status">Waiting for datasets...</p>
      )}
    </section>
  );
}
