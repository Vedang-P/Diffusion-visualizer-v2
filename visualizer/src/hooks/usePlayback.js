import { useEffect } from 'react';

export default function usePlayback({ isPlaying, maxStep, playbackMs, onTick }) {
  useEffect(() => {
    if (!isPlaying || maxStep <= 0) {
      return undefined;
    }

    const handle = window.setInterval(() => {
      onTick((prevStep) => (prevStep >= maxStep ? 0 : prevStep + 1));
    }, playbackMs);

    return () => window.clearInterval(handle);
  }, [isPlaying, maxStep, playbackMs, onTick]);
}
