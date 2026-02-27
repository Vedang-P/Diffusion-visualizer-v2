import { useEffect, useState } from 'react';

export default function BlurFade({ children, delay = 0, trigger = true, className = '' }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!trigger) {
      setVisible(false);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setVisible(true);
    }, Math.max(0, delay * 1000));

    return () => window.clearTimeout(timeout);
  }, [delay, trigger]);

  const classes = ['blur-fade', visible ? 'is-visible' : '', className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}
