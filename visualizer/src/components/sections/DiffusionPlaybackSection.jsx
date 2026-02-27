import FrameCanvas from '../ui/FrameCanvas';

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
      <div className="section-header">
        <p className="section-overline">Fast-forward Trace</p>
        <h2>Scroll enters playback, timeline accelerates.</h2>
      </div>

      {loading ? <p className="status-line">Loading frame bundles...</p> : null}
      {error ? <p className="status-line status-line-error">{error}</p> : null}

      {ready ? (
        <div className="trace-grid">
          <RenderPanel title={traceALabel} src={traceAFrame} step={step} />
          <RenderPanel title={traceBLabel} src={traceBFrame} step={step} />
        </div>
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
