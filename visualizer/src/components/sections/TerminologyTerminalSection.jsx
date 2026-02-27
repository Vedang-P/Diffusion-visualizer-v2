import { BlockMath } from 'react-katex';

const TERMINOLOGY_ITEMS = [
  {
    term: 'Step Control',
    meaning:
      'The step slider is a deterministic index selector over the precomputed denoising trajectory. Moving from step 0 toward the final step does not generate new samples in the browser; it selects a different state snapshot exported during the SDXL reverse process. Every plotted value in this panel (latent norm, noise norm, cosine drift, KL shift) is read from arrays at the same timestep index, so the image, line markers, and metric cards always remain causally synchronized.',
    equation: 's \\in \\{0,\\ldots,T\\} \\Rightarrow \\{x_s,\\hat{\\epsilon}_s,m_s\\}',
    equationNote:
      'This notation says one selected step s maps to one latent state x_s, one predicted-noise state \\hat{\\epsilon}_s, and one metric bundle m_s. The slider is therefore a synchronized lookup operator, not a separate optimization process.'
  },
  {
    term: 'Reverse Denoising Update',
    meaning:
      'Diffusion sampling runs in reverse time: the model starts from noise and progressively removes uncertainty. At each timestep, UNet predicts the residual noise and the scheduler transforms x_t into x_{t-1}. In the visualizer, this is why early steps look globally noisy while later steps lock geometry, edges, and illumination; the slider simply exposes this reverse trajectory point-by-point.',
    equation: 'x_{t-1}=\\mathrm{SchedulerStep}\\left(x_t,\\epsilon_\\theta(x_t,t,c),t\\right)',
    equationNote:
      'The term \\epsilon_\\theta(x_t,t,c) is the model noise estimate conditioned on prompt embeddings c. The scheduler then applies its timestep-specific coefficients to compute the previous latent.'
  },
  {
    term: 'Denoising Magnitude (Latent vs Noise)',
    meaning:
      'This chart compares two magnitudes across timesteps: latent state norm and predicted noise norm. Together they show how much signal remains encoded in the latent and how aggressively the model is still correcting residual noise. When you move the slider, the vertical marker shifts to the selected step and reads both channels at that exact index, making it easy to see whether the process is still making structural changes or only fine-grained refinements.',
    equation: '\\|x_t\\|_2\\;\\text{and}\\;\\|\\hat{\\epsilon}_t\\|_2',
    equationNote:
      'Both quantities are L2 norms. The first measures total latent energy at step t; the second measures the magnitude of predicted residual noise. Their relative shape is a compact proxy for denoising intensity through time.'
  },
  {
    term: 'Latent Norm',
    meaning:
      'Latent norm is the scalar magnitude of the current latent tensor flattened into a vector. Large values generally indicate the latent still contains strong high-variance components inherited from noise or unresolved structure. As denoising progresses, this quantity often contracts or stabilizes, and slider movement lets you inspect exactly where the trajectory transitions from coarse semantic formation to subtle texture correction.',
    equation: '\\|x_t\\|_2 = \\sqrt{\\sum_i x_{t,i}^2}',
    equationNote:
      'The L2 norm is the Euclidean length of the latent vector. It compresses a high-dimensional latent tensor into one interpretable magnitude per timestep.'
  },
  {
    term: 'Noise Norm',
    meaning:
      'Noise norm measures the size of the model-predicted residual noise at each step. High values indicate the model still sees large corrective residuals; lower values typically mean the sample is converging and fewer global corrections are needed. Sliding across timesteps shows where predicted noise decays and where occasional spikes appear due to re-allocation of semantic attention.',
    equation: '\\|\\hat{\\epsilon}_t\\|_2 = \\sqrt{\\sum_i \\hat{\\epsilon}_{t,i}^2}',
    equationNote:
      'This is the same Euclidean norm applied to predicted noise instead of latent state. It provides a direct signal of denoising workload at each step.'
  },
  {
    term: 'Stability Signals (Cosine and KL)',
    meaning:
      'The stability panel combines geometric and distributional change indicators. Cosine drift captures directional consistency of latent motion between consecutive steps, while KL shift quantifies how much attention distributions reconfigure from one step to the next. When the slider moves, both markers update at the same selected timestep, so you can correlate visual changes with either smooth trajectory continuation or abrupt allocation shifts.',
    equation: '\\big(\\cos(x_t,x_{t-1}),\\;D_{\\mathrm{KL}}(P_t\\parallel P_{t-1})\\big)',
    equationNote:
      'High cosine with low KL usually means smooth refinement; lower cosine or KL spikes indicate stronger semantic reorganization events during denoising.'
  },
  {
    term: 'Cosine Drift',
    meaning:
      'Cosine drift (shown as cosine similarity to previous step) measures directional alignment between adjacent latent vectors. Values near 1 imply incremental, smooth updates; larger drops imply stronger direction changes in latent space. In practical reading, a smooth high-cosine regime corresponds to stable refinement, while local dips often align with perceptual shifts in object boundaries, lighting structure, or texture placement.',
    equation: '\\cos(x_t,x_{t-1})=\\frac{x_t^\\top x_{t-1}}{\\|x_t\\|_2\\|x_{t-1}\\|_2}',
    equationNote:
      'The numerator is an inner product and the denominator normalizes both vectors. The ratio isolates direction similarity independent of vector magnitude.'
  },
  {
    term: 'Attention KL Shift',
    meaning:
      'KL shift compares attention distributions between consecutive timesteps. It is asymmetric and especially useful for detecting reallocations of token influence even when the rendered image appears only subtly changed. When the slider lands on a step with elevated KL, it typically indicates the model has reassigned probability mass across tokens or spatial regions to enforce a different semantic constraint.',
    equation: 'D_{\\mathrm{KL}}(P_t\\parallel P_{t-1})=\\sum_i P_t(i)\\log\\frac{P_t(i)}{P_{t-1}(i)}',
    equationNote:
      'KL divergence is zero only when both distributions match exactly. Larger values imply stronger attention redistribution from step t-1 to step t.'
  },
  {
    term: 'Cross-Attention',
    meaning:
      'Cross-attention links text-token features to latent spatial queries, making prompt semantics spatially actionable. In this project, per-layer cross-attention maps are exported and later summarized into token activation statistics and KL-based temporal diagnostics. This is one of the main mechanisms through which language terms steer where concepts are enforced in the generated image.',
    equation: 'A_{\\mathrm{cross}}=\\operatorname{softmax}\\!\\left(\\frac{QK^\\top}{\\sqrt{d}}\\right)V',
    equationNote:
      'Q represents latent queries, K and V come from text-conditioned representations. Softmax normalizes token relevance before value aggregation.'
  },
  {
    term: 'Self-Attention',
    meaning:
      'Self-attention captures long-range spatial interactions inside latent feature maps without direct token mixing. It helps maintain geometric consistency, perspective coherence, and region-to-region dependencies as denoising proceeds. Although the panel focuses on scalar summaries, these interactions are critical for stabilizing global composition before final high-frequency details are committed.',
    equation: 'A_{\\mathrm{self}}=\\operatorname{softmax}\\!\\left(\\frac{Q_sK_s^\\top}{\\sqrt{d}}\\right)V_s',
    equationNote:
      'All tensors here are computed within the latent representation itself. The operation enables each location to contextually reweight other locations during update.'
  }
];

export default function TerminologyTerminalSection() {
  return (
    <section className="section section-terminology">
      <div className="terminology-shell">
        <header className="terminology-terminal-bar">
          <div className="boot-terminal-lights" aria-hidden>
            <span className="terminal-dot terminal-dot-close" />
            <span className="terminal-dot terminal-dot-minimize" />
            <span className="terminal-dot terminal-dot-maximize" />
          </div>
          <p>diffulizer://terminology</p>
          <span className="boot-terminal-spacer" aria-hidden />
        </header>

        <div className="terminology-terminal-body">
          <div className="terminology-grid" role="list">
            {TERMINOLOGY_ITEMS.map((item) => (
              <article className="terminology-item" key={item.term} role="listitem">
                <div className="terminology-term">{item.term}</div>
                <div className="terminology-meaning">{item.meaning}</div>
                <div className="terminology-equation">
                  <BlockMath math={item.equation} />
                </div>
                <p className="terminology-equation-note">{item.equationNote}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
