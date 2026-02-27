import FrameCanvas from '../ui/FrameCanvas';

const PROMPT_TEXT =
  '“A narrow neon-lit alley at night, wet pavement reflecting lantern light, cinematic lighting.”';

function RenderPanel({ title, src, step }) {
  return (
    <article className="trace-panel">
      <header className="trace-panel-header">
        <h3>{title}</h3>
        <span>t = {step}</span>
      </header>
      <div className="trace-panel-frame">
        {src ? <FrameCanvas src={src} alt={`${title} frame at step ${step}`} /> : <div className="trace-panel-placeholder">no frame</div>}
      </div>
    </article>
  );
}

export default function DiffusionPlaybackSection({
  sectionRef,
  loading,
  error,
  ready,
  step,
  maxStep,
  progress,
  traceAFrame,
  traceBFrame,
  traceALabel,
  traceBLabel
}) {
  return (
    <section ref={sectionRef} className="section section-playback">
      <div className="section-header section-header-playback">
        <h2>How does image diffusion work?</h2>
        <p className="section-playback-subtext">
          These images were generated from the same text prompt using the diffusion model Stable Diffusion XL. Generation begins
          from pure noise and proceeds through a sequence of reverse denoising steps, where structure is gradually introduced and
          refined. Each frame corresponds to a fixed timestep in this process.
        </p>
      </div>

      {loading ? <p className="status-line">Loading frame bundles...</p> : null}
      {error ? <p className="status-line status-line-error">{error}</p> : null}

      {ready ? (
        <>
          <div className="playback-prompt-terminal" aria-label="Image generation prompt">
            <header className="playback-prompt-terminal-bar">
              <div className="boot-terminal-lights" aria-hidden>
                <span className="terminal-dot terminal-dot-close" />
                <span className="terminal-dot terminal-dot-minimize" />
                <span className="terminal-dot terminal-dot-maximize" />
              </div>
              <p>prompt</p>
              <span className="playback-prompt-spacer" aria-hidden />
            </header>
            <div className="playback-prompt-terminal-body">
              <p className="playback-prompt-command">$ cd ~/diffulizer && cat prompt.txt</p>
              <p className="playback-prompt-output">{PROMPT_TEXT}</p>
            </div>
          </div>
          <div className="trace-grid">
            <RenderPanel title={traceALabel} src={traceAFrame} step={step} />
            <RenderPanel title={traceBLabel} src={traceBFrame} step={step} />
          </div>
        </>
      ) : null}

      <div className="timeline-readout" aria-live="polite">
        <div className="timeline-track">
          <div className="timeline-fill" style={{ transform: `scaleX(${progress})` }} />
        </div>
        <p>
          Step {step} / {maxStep}
        </p>
      </div>
    </section>
  );
}
