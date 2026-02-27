import FlickeringGrid from '../ui/FlickeringGrid';
import TextHoverEffect from '../ui/TextHoverEffect';

function IntroBox({ className = '', label, note, decorative = false }) {
  return (
    <article className={`intro-box ${className}`.trim()}>
      <FlickeringGrid className="intro-box-grid" squareSize={4} gridGap={6} color="#8d98ad" maxOpacity={0.58} flickerChance={0.12} />
      <div className="intro-box-content">
        {label ? <p className="intro-box-label">{label}</p> : null}
        {note ? <p className="intro-box-note">{note}</p> : null}
        {decorative ? <span className="intro-box-decorative">decorative grid</span> : null}
      </div>
    </article>
  );
}

function IntroBoxes() {
  return (
    <div className="intro-box-stack">
      <IntroBox className="intro-box-long" label="Diffusion Workspace" note="Structured visual blocks for the narrative flow." />
      <div className="intro-box-row">
        <IntroBox label="Latent Drift" note="Tracks denoising geometry over timesteps." />
        <IntroBox label="Attention Flux" note="Token focus shifts during generation." />
        <IntroBox label="Render Layer" note="Fast preview and stylized monitoring." />
      </div>
      <div className="intro-box-row">
        <IntroBox className="intro-box-wide" label="Synchronized Comparison Grid" note="Realistic and anime presets stay step-locked." />
        <IntroBox decorative />
      </div>
    </div>
  );
}

export default function IntroHeroSection() {
  return (
    <section className="intro-stage">
      <h1 className="diffulizer-title" aria-label="Diffulizer">
        <TextHoverEffect text="Diffulizer" />
      </h1>
      <IntroBoxes />
      <p className="scroll-note">scroll to begin</p>
    </section>
  );
}
