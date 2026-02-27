import { useState } from 'react';

export default function TextHoverEffect({ text, className = '' }) {
  const [hover, setHover] = useState(false);
  const [position, setPosition] = useState({ x: 50, y: 50 });

  const onMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    setPosition({ x, y });
  };

  return (
    <div
      className={`text-hover-effect ${hover ? 'is-hovered' : ''} ${className}`.trim()}
      style={{
        '--hover-x': `${position.x}%`,
        '--hover-y': `${position.y}%`
      }}
      onMouseMove={onMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      tabIndex={0}
      role="img"
      aria-label={text}
    >
      <span className="text-hover-base" aria-hidden>
        {text}
      </span>
      <span className="text-hover-reveal" aria-hidden>
        {text}
      </span>
      <span className="text-hover-glow" aria-hidden>
        {text}
      </span>
    </div>
  );
}
