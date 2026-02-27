import BlurFade from '../ui/BlurFade';
import WebcamPixelGrid from '../ui/WebcamPixelGrid';

export default function TerminalWelcomeSection({ sectionRef, message, showCursor, isActive }) {
  return (
    <section ref={sectionRef} className="terminal-stage">
      <div className="terminal-window">
        <div className="terminal-bar">
          <span />
          <span />
          <span />
          <p>diffulizer://intro</p>
        </div>
        <div className="terminal-body">
          <div className="terminal-webcam-layer">
            <WebcamPixelGrid
              gridCols={60}
              gridRows={40}
              maxElevation={50}
              motionSensitivity={0.25}
              elevationSmoothing={0.2}
              colorMode="webcam"
              backgroundColor="#030303"
              mirror
              gapRatio={0.05}
              invertColors={false}
              darken={0.6}
              borderColor="#ffffff"
              borderOpacity={0.06}
              className="terminal-webcam-grid"
              active={isActive}
              onWebcamError={(error) => {
                // Keep UI non-blocking if camera permission is denied.
                console.warn('Webcam error:', error);
              }}
            />
          </div>
          <div className="terminal-body-overlay" />
          <div className="terminal-content">
            <BlurFade delay={0} trigger={isActive}>
              <p className="terminal-command">$ boot --interactive</p>
            </BlurFade>
            <BlurFade delay={0.2} trigger={isActive}>
              <h2>
                {message}
                {showCursor ? <span className="cursor">|</span> : null}
              </h2>
            </BlurFade>
            <BlurFade delay={0.35} trigger={isActive}>
              <p className="terminal-sub">High-speed denoising playback initialized. Keep scrolling.</p>
            </BlurFade>
          </div>
        </div>
      </div>
    </section>
  );
}
