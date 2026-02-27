const GLITCH_LINES = [
  'x_t = sqrt(alpha_t) x_0 + sqrt(1-alpha_t) epsilon',
  'reverse process initialized',
  'sigma(t) scheduler aligned',
  'latent state cache primed',
  't : 23 -> 0',
  'predict epsilon_theta(x_t, t)',
  'cross-attention map normalized',
  'denoising trace synchronized'
];

export default function GlitchTilesSection() {
  return (
    <section className="section section-glitch">
      <div className="glitch-grid" aria-label="Diffusion transition diagnostics">
        {GLITCH_LINES.map((line, index) => (
          <article
            key={line}
            className={`glitch-tile glitch-variant-${(index % 4) + 1}`}
            data-text={line}
            aria-label={line}
          >
            <p>{line}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
