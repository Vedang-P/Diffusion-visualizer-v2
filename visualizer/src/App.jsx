import { useEffect, useMemo, useRef, useState } from 'react';
import BootScreenSection from './components/sections/BootScreenSection';
import DiffusionPlaybackSection from './components/sections/DiffusionPlaybackSection';
import MetricsScrubberSection from './components/sections/MetricsScrubberSection';
import FlickeringGrid from './components/ui/FlickeringGrid';
import { getPresetList } from './config/presets';
import { cleanupDatasetResources, getImageSrc, loadPresetDataset } from './utils/datasetLoader';

const PRESETS = getPresetList();
const INITIAL_VISUAL_STATE = {
  step: 0,
  playing: false,
  mode: 'auto'
};

function clampStep(value, maxStep) {
  return Math.max(0, Math.min(maxStep, Math.floor(value)));
}

export default function App() {
  const [datasets, setDatasets] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visualState, setVisualState] = useState(INITIAL_VISUAL_STATE);
  const [playbackVisibility, setPlaybackVisibility] = useState(0);
  const [metricsVisibility, setMetricsVisibility] = useState(0);

  const playbackRef = useRef(null);
  const metricsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const loaded = await Promise.all(PRESETS.map((preset) => loadPresetDataset(preset.id)));
        if (cancelled) {
          loaded.forEach((dataset) => cleanupDatasetResources(dataset));
          return;
        }

        const mapped = {};
        loaded.forEach((dataset) => {
          mapped[dataset.preset.id] = dataset;
        });
        setDatasets(mapped);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(datasets).forEach((dataset) => cleanupDatasetResources(dataset));
    };
  }, [datasets]);

  const traceA = datasets.realistic || null;
  const traceB = datasets.anime || null;
  const ready = Boolean(traceA && traceB);

  const maxStep = useMemo(() => {
    if (!ready) {
      return 0;
    }
    return Math.max(0, Math.min(traceA.metadata.steps, traceB.metadata.steps) - 1);
  }, [ready, traceA, traceB]);

  useEffect(() => {
    setVisualState((previous) => {
      if (previous.step <= maxStep) {
        return previous;
      }
      return {
        ...previous,
        step: maxStep
      };
    });
  }, [maxStep]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === playbackRef.current) {
            setPlaybackVisibility(entry.intersectionRatio);
          }
          if (entry.target === metricsRef.current) {
            setMetricsVisibility(entry.intersectionRatio);
          }
        });
      },
      {
        threshold: [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1]
      }
    );

    if (playbackRef.current) {
      observer.observe(playbackRef.current);
    }
    if (metricsRef.current) {
      observer.observe(metricsRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setVisualState((previous) => {
      if (metricsVisibility > 0.3) {
        if (previous.mode === 'scrub' && !previous.playing) {
          return previous;
        }
        return {
          ...previous,
          mode: 'scrub',
          playing: false
        };
      }

      if (playbackVisibility > 0.25) {
        if (previous.mode === 'auto' && previous.playing) {
          return previous;
        }
        return {
          ...previous,
          mode: 'auto',
          playing: true
        };
      }

      if (!previous.playing) {
        return previous;
      }

      return {
        ...previous,
        playing: false
      };
    });
  }, [metricsVisibility, playbackVisibility]);

  useEffect(() => {
    if (!ready || !visualState.playing || visualState.mode !== 'auto' || maxStep <= 0) {
      return undefined;
    }

    let frameHandle = 0;
    let last = window.performance.now();
    let accumulator = 0;

    const animate = (now) => {
      const delta = now - last;
      last = now;
      accumulator += delta;

      const speedFactor = 0.7 + playbackVisibility * 2.6;
      const frameDurationMs = Math.max(24, 130 / speedFactor);
      if (accumulator >= frameDurationMs) {
        const advances = Math.floor(accumulator / frameDurationMs);
        accumulator %= frameDurationMs;
        setVisualState((previous) => ({
          ...previous,
          step: (previous.step + advances) % (maxStep + 1)
        }));
      }

      frameHandle = window.requestAnimationFrame(animate);
    };

    frameHandle = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameHandle);
  }, [ready, visualState.mode, visualState.playing, maxStep, playbackVisibility]);

  const setScrubStep = (nextStep) => {
    const clamped = clampStep(nextStep, maxStep);
    setVisualState((previous) => ({
      ...previous,
      step: clamped,
      playing: false,
      mode: 'scrub'
    }));
  };

  const step = visualState.step;
  const progress = maxStep > 0 ? step / maxStep : 0;
  const traceAFrame = ready ? getImageSrc(traceA, step) : '';
  const traceBFrame = ready ? getImageSrc(traceB, step) : '';

  return (
    <>
      <div className="global-flicker-bg" aria-hidden>
        <FlickeringGrid
          className="global-flicker-grid"
          squareSize={4}
          gridGap={8}
          color="#2f5ca8"
          maxOpacity={0.74}
          flickerChance={0.16}
          height={1600}
          width={2200}
        />
        <div className="global-flicker-vignette" />
      </div>

      <main className="diff-site">
        <BootScreenSection />
        <DiffusionPlaybackSection
          sectionRef={playbackRef}
          loading={loading}
          error={error}
          ready={ready}
          step={step}
          maxStep={maxStep}
          progress={progress}
          traceAFrame={traceAFrame}
          traceBFrame={traceBFrame}
          traceALabel={traceA?.preset?.shortLabel || 'Trace A'}
          traceBLabel={traceB?.preset?.shortLabel || 'Trace B'}
        />
        <MetricsScrubberSection
          sectionRef={metricsRef}
          ready={ready}
          step={step}
          maxStep={maxStep}
          traceAFrame={traceAFrame}
          traceBFrame={traceBFrame}
          metricsDataset={traceA}
          onScrubStep={setScrubStep}
        />
      </main>
    </>
  );
}
