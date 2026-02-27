import { useEffect, useMemo, useState } from 'react';
import GlobalControls from './components/GlobalControls';
import SectionAttention from './components/SectionAttention';
import SectionComparison from './components/SectionComparison';
import SectionHero from './components/SectionHero';
import SectionInsights from './components/SectionInsights';
import SectionTimeline from './components/SectionTimeline';
import SectionTrajectory from './components/SectionTrajectory';
import { getPresetList } from './config/presets';
import usePlayback from './hooks/usePlayback';
import { disposeAttentionWorker } from './utils/attentionWorkerClient';
import { cleanupDatasetResources, getCrossLayerIds, loadPresetDataset } from './utils/datasetLoader';
import { getMeaningfulTokenCount, normalizeToken } from './utils/tokenUtils';

const PRESETS = getPresetList();

function intersectLayers(datasetA, datasetB) {
  const setB = new Set(getCrossLayerIds(datasetB));
  return getCrossLayerIds(datasetA).filter((layer) => setB.has(layer));
}

function tokenListForPair(datasetA, datasetB) {
  const count = Math.max(1, Math.min(getMeaningfulTokenCount(datasetA), getMeaningfulTokenCount(datasetB)));
  return (datasetA.metadata.prompt.tokens || []).slice(0, count).map((token) => normalizeToken(token) || '[special]');
}

export default function App() {
  const [datasets, setDatasets] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activePresetA, setActivePresetA] = useState('realistic');
  const [activePresetB, setActivePresetB] = useState('anime');

  const [globalStep, setGlobalStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackMs, setPlaybackMs] = useState(260);
  const [selectedLayer, setSelectedLayer] = useState('');
  const [selectedTokenIndex, setSelectedTokenIndex] = useState(0);
  const [attentionOpacity, setAttentionOpacity] = useState(0.7);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const loaded = await Promise.all(PRESETS.map((preset) => loadPresetDataset(preset.id)));
        if (cancelled) {
          loaded.forEach((dataset) => cleanupDatasetResources(dataset));
          return;
        }

        const nextDatasets = {};
        loaded.forEach((dataset) => {
          nextDatasets[dataset.preset.id] = dataset;
        });

        setDatasets(nextDatasets);
        setError('');
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

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(datasets).forEach((dataset) => cleanupDatasetResources(dataset));
      disposeAttentionWorker();
    };
  }, [datasets]);

  const datasetA = datasets[activePresetA] || null;
  const datasetB = datasets[activePresetB] || null;
  const isReady = Boolean(datasetA && datasetB);

  const maxStep = useMemo(() => {
    if (!isReady) {
      return 0;
    }
    return Math.max(0, Math.min(datasetA.metadata.steps, datasetB.metadata.steps) - 1);
  }, [datasetA, datasetB, isReady]);

  useEffect(() => {
    if (globalStep > maxStep) {
      setGlobalStep(maxStep);
    }
  }, [globalStep, maxStep]);

  const layerOptions = useMemo(() => {
    if (!isReady) {
      return [];
    }
    return intersectLayers(datasetA, datasetB);
  }, [datasetA, datasetB, isReady]);

  useEffect(() => {
    if (!layerOptions.length) {
      setSelectedLayer('');
      return;
    }
    if (!layerOptions.includes(selectedLayer)) {
      setSelectedLayer(layerOptions[0]);
    }
  }, [layerOptions, selectedLayer]);

  const tokenOptions = useMemo(() => {
    if (!isReady) {
      return ['[special]'];
    }
    return tokenListForPair(datasetA, datasetB);
  }, [datasetA, datasetB, isReady]);

  const maxTokenIndex = Math.max(0, tokenOptions.length - 1);
  useEffect(() => {
    if (selectedTokenIndex > maxTokenIndex) {
      setSelectedTokenIndex(maxTokenIndex);
    }
  }, [maxTokenIndex, selectedTokenIndex]);

  usePlayback({
    isPlaying,
    maxStep,
    playbackMs,
    onTick: setGlobalStep
  });

  const presetA = PRESETS.find((preset) => preset.id === activePresetA) || PRESETS[0];
  const presetB = PRESETS.find((preset) => preset.id === activePresetB) || PRESETS[1] || PRESETS[0];

  return (
    <main className="diffulizer-shell">
      <SectionHero />

      {loading ? <section className="status-panel">Loading hardcoded preset datasets...</section> : null}
      {error ? <section className="status-panel error">Failed to load presets: {error}</section> : null}

      {isReady ? (
        <>
          <GlobalControls
            presets={PRESETS}
            activePresetA={activePresetA}
            activePresetB={activePresetB}
            onPresetAChange={setActivePresetA}
            onPresetBChange={setActivePresetB}
            globalStep={globalStep}
            maxStep={maxStep}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((value) => !value)}
            onStepChange={setGlobalStep}
            onReset={setGlobalStep}
            playbackMs={playbackMs}
            onPlaybackMsChange={setPlaybackMs}
            selectedLayer={selectedLayer}
            layerOptions={layerOptions.length ? layerOptions : ['']}
            onLayerChange={setSelectedLayer}
            selectedTokenIndex={selectedTokenIndex}
            maxTokenIndex={maxTokenIndex}
            tokenOptions={tokenOptions}
            onTokenChange={setSelectedTokenIndex}
            attentionOpacity={attentionOpacity}
            onAttentionOpacityChange={setAttentionOpacity}
          />

          <div className="story-stack">
            <SectionTimeline datasetA={datasetA} datasetB={datasetB} presetA={presetA} presetB={presetB} globalStep={globalStep} />
            <SectionAttention
              datasetA={datasetA}
              datasetB={datasetB}
              presetA={presetA}
              presetB={presetB}
              globalStep={globalStep}
              selectedLayer={selectedLayer}
              selectedTokenIndex={selectedTokenIndex}
              attentionOpacity={attentionOpacity}
              tokenOptions={tokenOptions}
            />
            <SectionTrajectory datasetA={datasetA} datasetB={datasetB} presetA={presetA} presetB={presetB} globalStep={globalStep} />
            <SectionComparison
              datasetA={datasetA}
              datasetB={datasetB}
              globalStep={globalStep}
              selectedLayer={selectedLayer}
              selectedTokenIndex={selectedTokenIndex}
            />
            <SectionInsights
              datasetA={datasetA}
              datasetB={datasetB}
              presetA={presetA}
              presetB={presetB}
              globalStep={globalStep}
              selectedLayer={selectedLayer}
              selectedTokenIndex={selectedTokenIndex}
            />
          </div>
        </>
      ) : null}
    </main>
  );
}
