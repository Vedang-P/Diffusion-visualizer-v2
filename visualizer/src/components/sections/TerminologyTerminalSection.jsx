import { BlockMath } from 'react-katex';

const TERMINOLOGY_ITEMS = [
  {
    term: 'Forward Noising',
    meaning: 'Defines how clean data is corrupted with Gaussian noise at timestep t.',
    equation: 'x_t = \\sqrt{\\bar{\\alpha}_t}x_0 + \\sqrt{1-\\bar{\\alpha}_t}\\,\\epsilon,\\; \\epsilon \\sim \\mathcal{N}(0, I)'
  },
  {
    term: 'Reverse Transition',
    meaning: 'The model parameterizes the reverse conditional from x_t to x_{t-1}.',
    equation: 'p_\\theta(x_{t-1}\\mid x_t)=\\mathcal{N}(\\mu_\\theta(x_t,t),\\sigma_t^2 I)'
  },
  {
    term: 'Noise Prediction',
    meaning: 'UNet estimates the noise residual used by the scheduler update.',
    equation: '\\epsilon_\\theta = \\epsilon_\\theta(x_t, t, c)'
  },
  {
    term: 'Simple Training Loss',
    meaning: 'Standard objective minimizing error between true and predicted noise.',
    equation:
      '\\mathcal{L}_{\\mathrm{simple}} = \\mathbb{E}_{t,x_0,\\epsilon}\\left[\\lVert \\epsilon - \\epsilon_\\theta(x_t,t) \\rVert_2^2\\right]'
  },
  {
    term: 'Classifier-Free Guidance',
    meaning: 'Interpolates between unconditional and text-conditional predictions.',
    equation:
      '\\epsilon_{\\mathrm{cfg}} = \\epsilon_{\\mathrm{uncond}} + s\\left(\\epsilon_{\\mathrm{text}} - \\epsilon_{\\mathrm{uncond}}\\right)'
  },
  {
    term: 'Cross-Attention',
    meaning: 'Maps prompt-token relevance onto latent spatial positions.',
    equation: 'A_{\\mathrm{cross}} = \\operatorname{softmax}\\!\\left(\\frac{QK^\\top}{\\sqrt{d}}\\right)V'
  },
  {
    term: 'Self-Attention',
    meaning: 'Captures spatial-to-spatial interactions inside the latent feature map.',
    equation: 'A_{\\mathrm{self}} = \\operatorname{softmax}\\!\\left(\\frac{Q_sK_s^\\top}{\\sqrt{d}}\\right)V_s'
  },
  {
    term: 'Latent Norm',
    meaning: 'Tracks magnitude of the latent state through denoising.',
    equation: '\\lVert x_t \\rVert_2 = \\sqrt{\\sum_i x_{t,i}^2}'
  },
  {
    term: 'Cosine Drift',
    meaning: 'Measures directional change of latent updates between adjacent steps.',
    equation: '\\cos(x_t, x_{t-1}) = \\frac{x_t^\\top x_{t-1}}{\\lVert x_t \\rVert_2\\,\\lVert x_{t-1} \\rVert_2}'
  },
  {
    term: 'Attention KL Shift',
    meaning: 'Quantifies attention-distribution movement across consecutive timesteps.',
    equation: 'D_{\\mathrm{KL}}(P_t \\parallel P_{t-1}) = \\sum_i P_t(i)\\log\\frac{P_t(i)}{P_{t-1}(i)}'
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
          <div className="terminology-header">
            <h2>Terminology and Mathematical Definitions</h2>
            <p>Core concepts used in the interface, with the corresponding equations used in diffusion modeling.</p>
          </div>

          <div className="terminology-grid" role="list">
            {TERMINOLOGY_ITEMS.map((item) => (
              <article className="terminology-item" key={item.term} role="listitem">
                <div className="terminology-term">{item.term}</div>
                <div className="terminology-meaning">{item.meaning}</div>
                <div className="terminology-equation">
                  <BlockMath math={item.equation} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
