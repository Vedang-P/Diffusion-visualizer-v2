import { useEffect, useRef, useState } from 'react';

function isCoarsePointer() {
  if (typeof window === 'undefined') {
    return true;
  }
  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

export default function SmoothCursor() {
  const [enabled, setEnabled] = useState(() => !isCoarsePointer());
  const [visible, setVisible] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [position, setPosition] = useState({ x: -200, y: -200 });

  const targetRef = useRef({ x: -200, y: -200 });
  const currentRef = useRef({ x: -200, y: -200 });
  const frameRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const updatePointerMode = () => {
      setEnabled(!isCoarsePointer());
    };

    const handleMove = (event) => {
      targetRef.current.x = event.clientX;
      targetRef.current.y = event.clientY;
      setVisible(true);
    };

    const handleLeave = () => {
      setVisible(false);
    };

    const handleDown = () => setPressed(true);
    const handleUp = () => setPressed(false);

    const handleOver = (event) => {
      const node = event.target;
      if (!(node instanceof Element)) {
        setInteractive(false);
        return;
      }

      const interactiveNode = node.closest(
        'a,button,input,textarea,select,label,[role="button"],.boot-glitch-tile,.glitch-tile'
      );
      setInteractive(Boolean(interactiveNode));
    };

    const animate = () => {
      const dx = targetRef.current.x - currentRef.current.x;
      const dy = targetRef.current.y - currentRef.current.y;
      currentRef.current.x += dx * 0.18;
      currentRef.current.y += dy * 0.18;
      setPosition({ x: currentRef.current.x, y: currentRef.current.y });
      frameRef.current = window.requestAnimationFrame(animate);
    };

    frameRef.current = window.requestAnimationFrame(animate);
    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('mouseout', handleLeave, { passive: true });
    window.addEventListener('mousedown', handleDown, { passive: true });
    window.addEventListener('mouseup', handleUp, { passive: true });
    window.addEventListener('mouseover', handleOver, { passive: true });
    window.addEventListener('resize', updatePointerMode);

    return () => {
      window.cancelAnimationFrame(frameRef.current);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseout', handleLeave);
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('mouseover', handleOver);
      window.removeEventListener('resize', updatePointerMode);
    };
  }, [enabled]);

  useEffect(() => {
    if (!isCoarsePointer()) {
      return undefined;
    }
    setEnabled(false);
    setVisible(false);
    return undefined;
  }, []);

  if (!enabled) {
    return null;
  }

  const layerClass = [
    'smooth-cursor-layer',
    visible ? 'is-visible' : '',
    interactive ? 'is-interactive' : '',
    pressed ? 'is-pressed' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={layerClass} aria-hidden>
      <span className="smooth-cursor-ring" style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }} />
      <span className="smooth-cursor-dot" style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }} />
    </div>
  );
}
