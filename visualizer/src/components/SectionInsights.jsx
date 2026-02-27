function format(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'missing';
}

function getEntropy(stepData, layerId) {
  return stepData?.by_layer?.[layerId];
}

function InsightCard({ title, value, note }) {
  return (
    <article className="insight-card">
      <p>{title}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

export default function SectionInsights({ datasetA, datasetB, presetA, presetB, globalStep, selectedLayer, selectedTokenIndex }) {
  const rowA = datasetA.metrics.mean_token_activation?.[globalStep] || [];
  const rowB = datasetB.metrics.mean_token_activation?.[globalStep] || [];

  const cosineA = datasetA.metrics.cosine_similarity_to_previous?.[globalStep];
  const cosineB = datasetB.metrics.cosine_similarity_to_previous?.[globalStep];

  const klA = datasetA.metrics.attention_kl_divergence?.[globalStep];
  const klB = datasetB.metrics.attention_kl_divergence?.[globalStep];

  const entropyA = getEntropy(datasetA.metrics.cross_attention_entropy?.[globalStep], selectedLayer);
  const entropyB = getEntropy(datasetB.metrics.cross_attention_entropy?.[globalStep], selectedLayer);

  const tokenActA = rowA[selectedTokenIndex];
  const tokenActB = rowB[selectedTokenIndex];

  return (
    <section className="story-section section-reveal">
      <div className="section-header">
        <p>05</p>
        <div>
          <h2>Metric Insights</h2>
          <p>Advanced readout for per-step behavior under identical controls with explicit missing-value visibility.</p>
        </div>
      </div>

      <div className="insight-grid">
        <InsightCard
          title={`${presetA.shortLabel} Cosine Drift`}
          value={format(cosineA)}
          note="Similarity of current latent to previous step"
        />
        <InsightCard title={`${presetB.shortLabel} Cosine Drift`} value={format(cosineB)} note="Lower values imply larger update" />
        <InsightCard title={`${presetA.shortLabel} KL Shift`} value={format(klA)} note="Token distribution drift vs previous step" />
        <InsightCard title={`${presetB.shortLabel} KL Shift`} value={format(klB)} note="Higher spikes indicate reallocation of attention mass" />
        <InsightCard
          title={`${presetA.shortLabel} Entropy (${selectedLayer})`}
          value={format(entropyA)}
          note="Cross-attention entropy at selected layer"
        />
        <InsightCard
          title={`${presetB.shortLabel} Entropy (${selectedLayer})`}
          value={format(entropyB)}
          note="Missing values indicate invalid measurements in source metrics"
        />
        <InsightCard
          title={`${presetA.shortLabel} Token[${selectedTokenIndex}] Activation`}
          value={format(tokenActA)}
          note="Mean token activation across selected step"
        />
        <InsightCard
          title={`${presetB.shortLabel} Token[${selectedTokenIndex}] Activation`}
          value={format(tokenActB)}
          note="Use with attention overlay to interpret region emphasis"
        />
      </div>
    </section>
  );
}
