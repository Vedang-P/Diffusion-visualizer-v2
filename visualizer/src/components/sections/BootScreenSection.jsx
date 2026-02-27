import { useEffect, useState } from 'react';
import { InlineMath } from 'react-katex';
import HyperText from '../ui/HyperText';
import WebcamPixelGrid from '../ui/WebcamPixelGrid';

const BOOT_EQUATIONS = [
  { latex: 'x_t = \\sqrt{\\bar{\\alpha}_t}x_0 + \\sqrt{1-\\bar{\\alpha}_t}\\,\\epsilon', size: 'xl' },
  { latex: 'q(x_t\\mid x_0)=\\mathcal{N}(\\sqrt{\\bar{\\alpha}_t}x_0,(1-\\bar{\\alpha}_t)I)', size: 'xl' },
  { latex: 'p_\\theta(x_{t-1}\\mid x_t)=\\mathcal{N}(\\mu_\\theta(x_t,t),\\sigma_t^2 I)', size: 'l' },
  {
    latex:
      '\\mu_\\theta(x_t,t)=\\frac{1}{\\sqrt{\\alpha_t}}\\left(x_t-\\frac{1-\\alpha_t}{\\sqrt{1-\\bar{\\alpha}_t}}\\epsilon_\\theta(x_t,t)\\right)',
    size: 'xxl'
  },
  { latex: '\\hat{x}_0=\\frac{x_t-\\sqrt{1-\\bar{\\alpha}_t}\\,\\epsilon_\\theta(x_t,t)}{\\sqrt{\\bar{\\alpha}_t}}', size: 'xl' },
  { latex: 'L_{\\text{simple}}=\\mathbb{E}_{t,x_0,\\epsilon}\\left[\\lVert\\epsilon-\\epsilon_\\theta(x_t,t)\\rVert_2^2\\right]', size: 'l' },
  { latex: 'A=\\operatorname{softmax}\\!\\left(\\frac{QK^\\top}{\\sqrt{d}}\\right)V', size: 'm' },
  { latex: 't:T\\rightarrow 0', size: 's' }
];

export default function BootScreenSection() {
  const [enableWebcamGrid, setEnableWebcamGrid] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const coarseOrSmallQuery = window.matchMedia('(max-width: 768px), (pointer: coarse)');
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const update = () => {
      setEnableWebcamGrid(!(coarseOrSmallQuery.matches || reducedMotionQuery.matches));
    };

    update();
    if (typeof coarseOrSmallQuery.addEventListener === 'function') {
      coarseOrSmallQuery.addEventListener('change', update);
      reducedMotionQuery.addEventListener('change', update);
    } else {
      coarseOrSmallQuery.addListener(update);
      reducedMotionQuery.addListener(update);
    }

    return () => {
      if (typeof coarseOrSmallQuery.removeEventListener === 'function') {
        coarseOrSmallQuery.removeEventListener('change', update);
        reducedMotionQuery.removeEventListener('change', update);
      } else {
        coarseOrSmallQuery.removeListener(update);
        reducedMotionQuery.removeListener(update);
      }
    };
  }, []);

  return (
    <section className="section section-boot">
      <div className="boot-shell">
        <div className="boot-terminal-bar">
          <div className="boot-terminal-lights" aria-hidden>
            <span className="terminal-dot terminal-dot-close" />
            <span className="terminal-dot terminal-dot-minimize" />
            <span className="terminal-dot terminal-dot-maximize" />
          </div>
          <p>diffulizer://boot</p>
          <span className="boot-terminal-spacer" aria-hidden />
        </div>
        <div className="boot-terminal-body">
          <div className="boot-terminal-media">
            <WebcamPixelGrid
              gridCols={60}
              gridRows={40}
              maxElevation={50}
              motionSensitivity={0.25}
              elevationSmoothing={0.2}
              colorMode="webcam"
              backgroundColor="#000000"
              mirror
              gapRatio={0.05}
              invertColors={false}
              darken={0.6}
              borderColor="#ffffff"
              borderOpacity={0.06}
              className="boot-webcam-grid"
              active={enableWebcamGrid}
              showFallbackMessage={false}
            />
          </div>
          <div className="boot-terminal-overlay" />
          <div className="boot-terminal-content">
            <p className="boot-command">$ boot --interactive</p>
            <h1 className="boot-title">
              <HyperText text="Diffulizer" className="boot-hyper-title" />
            </h1>
            <div className="boot-tile-wrap">
              <div className="boot-tile-row boot-tile-row-top">
                {BOOT_EQUATIONS.slice(0, 5).map((item) => (
                  <article key={item.latex} className={`boot-equation-tile boot-tile-${item.size}`}>
                    <div className="boot-tile-math">
                      <InlineMath math={item.latex} />
                    </div>
                  </article>
                ))}
              </div>
              <div className="boot-tile-row boot-tile-row-bottom">
                {BOOT_EQUATIONS.slice(5).map((item) => (
                  <article key={item.latex} className={`boot-equation-tile boot-tile-${item.size}`}>
                    <div className="boot-tile-math">
                      <InlineMath math={item.latex} />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
