import { useCallback, useEffect, useRef, useState } from 'react';

const RANDOM_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomChar() {
  const index = Math.floor(Math.random() * RANDOM_CHARS.length);
  return RANDOM_CHARS[index];
}

export default function HyperText({ text, className = '', durationMs = 900 }) {
  const [display, setDisplay] = useState(text);
  const frameRef = useRef(0);

  const startAnimation = useCallback(() => {
    window.cancelAnimationFrame(frameRef.current);
    const startedAt = window.performance.now();

    const tick = (now) => {
      const progress = Math.max(0, Math.min(1, (now - startedAt) / Math.max(120, durationMs)));
      const locked = Math.floor(progress * text.length);

      let next = '';
      for (let index = 0; index < text.length; index += 1) {
        const target = text[index];
        if (target === ' ') {
          next += ' ';
          continue;
        }
        next += index <= locked ? target : randomChar();
      }
      setDisplay(next);

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick);
      } else {
        setDisplay(text);
      }
    };

    frameRef.current = window.requestAnimationFrame(tick);
  }, [durationMs, text]);

  useEffect(() => {
    startAnimation();
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [startAnimation]);

  return (
    <span className={`hyper-text ${className}`.trim()} onMouseEnter={startAnimation}>
      {display}
    </span>
  );
}
