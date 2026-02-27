import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-=*/\\[]{}()<>#@%&';

function randomChar(charset) {
  const index = Math.floor(Math.random() * charset.length);
  return charset[index];
}

export default function EncryptedText({
  text,
  className = '',
  encryptedClassName = '',
  revealedClassName = '',
  revealDelayMs = 50,
  loopIntervalMs = 4200,
  playOnMount = true
}) {
  const [display, setDisplay] = useState(text);
  const [encrypting, setEncrypting] = useState(false);
  const intervalRef = useRef(0);
  const loopRef = useRef(0);

  const run = useCallback(() => {
    window.clearInterval(intervalRef.current);
    setEncrypting(true);

    let revealIndex = -1;
    intervalRef.current = window.setInterval(() => {
      revealIndex += 1;
      if (revealIndex > text.length) {
        window.clearInterval(intervalRef.current);
        setDisplay(text);
        setEncrypting(false);
        return;
      }

      let next = '';
      for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === ' ') {
          next += ' ';
          continue;
        }
        next += index <= revealIndex ? character : randomChar(DEFAULT_CHARSET);
      }
      setDisplay(next);
    }, Math.max(16, revealDelayMs));
  }, [revealDelayMs, text]);

  useEffect(() => {
    if (playOnMount) {
      run();
    }
    if (loopIntervalMs > 0) {
      loopRef.current = window.setInterval(run, Math.max(1200, loopIntervalMs));
    }

    return () => {
      window.clearInterval(intervalRef.current);
      window.clearInterval(loopRef.current);
    };
  }, [loopIntervalMs, playOnMount, run]);

  const classes = [
    'encrypted-text',
    className,
    encrypting ? encryptedClassName : revealedClassName,
    encrypting ? 'is-encrypting' : 'is-revealed'
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} onMouseEnter={run}>
      {display}
    </span>
  );
}
