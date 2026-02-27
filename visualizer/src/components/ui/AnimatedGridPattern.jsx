import { useMemo } from 'react';

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function buildSquares(count) {
  const random = createSeededRandom(131071);
  const squares = [];

  for (let index = 0; index < count; index += 1) {
    const size = 1.1 + random() * 2.8;
    squares.push({
      id: index,
      left: random() * 100,
      top: random() * 100,
      size,
      delay: random() * 3.5,
      speedJitter: random() * 1.8,
      rotation: (random() - 0.5) * 12
    });
  }

  return squares;
}

export default function AnimatedGridPattern({
  numSquares = 30,
  maxOpacity = 0.1,
  duration = 3,
  repeatDelay = 1,
  className = ''
}) {
  const squares = useMemo(() => buildSquares(Math.max(1, numSquares)), [numSquares]);

  return (
    <div
      className={`animated-grid-pattern ${className}`.trim()}
      style={{
        '--grid-max-opacity': maxOpacity,
        '--grid-duration': `${duration}s`,
        '--grid-repeat-delay': `${repeatDelay}s`
      }}
      aria-hidden
    >
      {squares.map((square) => (
        <span
          key={square.id}
          className="grid-square"
          style={{
            left: `${square.left}%`,
            top: `${square.top}%`,
            width: `${square.size}%`,
            height: `${square.size}%`,
            transform: `rotate(${square.rotation}deg)`,
            animationDelay: `${square.delay}s`,
            animationDuration: `calc(var(--grid-duration) + ${square.speedJitter.toFixed(3)}s + var(--grid-repeat-delay))`
          }}
        />
      ))}
    </div>
  );
}
