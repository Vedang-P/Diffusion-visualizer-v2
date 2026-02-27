import { useMemo } from 'react';

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3 ? normalized.split('').map((part) => `${part}${part}`).join('') : normalized;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) {
    return `rgba(107, 114, 128, ${alpha})`;
  }

  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildFlickers({ squareSize, gridGap, width, height, flickerChance }) {
  const random = createSeededRandom(71933);
  const cellStep = Math.max(3, squareSize + gridGap);
  const columns = Math.max(8, Math.floor(width / cellStep));
  const rows = Math.max(8, Math.floor(height / cellStep));
  const totalCells = columns * rows;
  const density = Math.max(0.04, Math.min(0.4, flickerChance));
  const count = Math.max(30, Math.min(520, Math.floor(totalCells * density * 0.16)));

  const flickers = [];
  for (let index = 0; index < count; index += 1) {
    flickers.push({
      id: index,
      left: random() * 100,
      top: random() * 100,
      delay: random() * 3.4,
      duration: 1.1 + random() * 1.6,
      scale: 0.85 + random() * 0.35,
      opacity: 0.2 + random() * 0.8
    });
  }
  return flickers;
}

export default function FlickeringGrid({
  className = '',
  squareSize = 4,
  gridGap = 6,
  color = '#6B7280',
  maxOpacity = 0.5,
  flickerChance = 0.1,
  height = 800,
  width = 800
}) {
  const flickers = useMemo(
    () => buildFlickers({ squareSize, gridGap, width, height, flickerChance }),
    [squareSize, gridGap, width, height, flickerChance]
  );

  return (
    <div
      className={`flickering-grid ${className}`.trim()}
      style={{
        '--fg-square-size': `${squareSize}px`,
        '--fg-grid-gap': `${gridGap}px`,
        '--fg-grid-line': hexToRgba(color, 0.18),
        '--fg-flicker-color': hexToRgba(color, Math.max(0.2, Math.min(1, maxOpacity)))
      }}
      aria-hidden
    >
      {flickers.map((flicker) => (
        <span
          key={flicker.id}
          className="flickering-cell"
          style={{
            left: `${flicker.left}%`,
            top: `${flicker.top}%`,
            animationDelay: `${flicker.delay}s`,
            animationDuration: `${flicker.duration}s`,
            transform: `scale(${flicker.scale})`,
            '--fg-cell-opacity': `${flicker.opacity}`
          }}
        />
      ))}
    </div>
  );
}
