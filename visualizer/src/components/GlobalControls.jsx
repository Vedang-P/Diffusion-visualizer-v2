export default function GlobalControls({
  presets,
  activePresetA,
  activePresetB,
  onPresetAChange,
  onPresetBChange,
  globalStep,
  maxStep,
  isPlaying,
  onTogglePlay,
  onStepChange,
  onReset,
  playbackMs,
  onPlaybackMsChange,
  selectedLayer,
  layerOptions,
  onLayerChange,
  selectedTokenIndex,
  maxTokenIndex,
  tokenOptions,
  onTokenChange,
  attentionOpacity,
  onAttentionOpacityChange
}) {
  return (
    <section className="control-rail">
      <div className="control-groups">
        <div className="control-group">
          <p className="control-label">Left Run</p>
          <div className="chip-row">
            {presets.map((preset) => (
              <button
                key={`left-${preset.id}`}
                className={`chip ${activePresetA === preset.id ? 'active' : ''}`}
                onClick={() => onPresetAChange(preset.id)}
              >
                {preset.shortLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <p className="control-label">Right Run</p>
          <div className="chip-row">
            {presets.map((preset) => (
              <button
                key={`right-${preset.id}`}
                className={`chip ${activePresetB === preset.id ? 'active' : ''}`}
                onClick={() => onPresetBChange(preset.id)}
              >
                {preset.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="slider-grid">
        <label>
          <span>Global Step</span>
          <input
            type="range"
            min={0}
            max={maxStep}
            value={Math.min(globalStep, maxStep)}
            onChange={(event) => onStepChange(Number(event.target.value))}
          />
          <small>
            {Math.min(globalStep, maxStep)} / {maxStep}
          </small>
        </label>

        <label>
          <span>Playback</span>
          <input
            type="range"
            min={100}
            max={800}
            step={10}
            value={playbackMs}
            onChange={(event) => onPlaybackMsChange(Number(event.target.value))}
          />
          <small>{playbackMs} ms</small>
        </label>

        <label>
          <span>Cross Layer</span>
          <select value={selectedLayer} onChange={(event) => onLayerChange(event.target.value)}>
            {layerOptions.map((layer) => (
              <option key={layer} value={layer}>
                {layer}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Token Index</span>
          <input
            type="range"
            min={0}
            max={maxTokenIndex}
            value={Math.min(selectedTokenIndex, maxTokenIndex)}
            onChange={(event) => onTokenChange(Number(event.target.value))}
          />
          <small>{Math.min(selectedTokenIndex, maxTokenIndex)}</small>
        </label>

        <label>
          <span>Token Label</span>
          <select value={Math.min(selectedTokenIndex, maxTokenIndex)} onChange={(event) => onTokenChange(Number(event.target.value))}>
            {tokenOptions.map((token, index) => (
              <option key={`${token}-${index}`} value={index}>
                [{index}] {token}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Attention Opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(attentionOpacity * 100)}
            onChange={(event) => onAttentionOpacityChange(Number(event.target.value) / 100)}
          />
          <small>{Math.round(attentionOpacity * 100)}%</small>
        </label>
      </div>

      <div className="action-row">
        <button className="primary" onClick={onTogglePlay}>
          {isPlaying ? 'Pause Playback' : 'Resume Playback'}
        </button>
        <button onClick={() => onReset(0)}>Reset to Step 0</button>
      </div>
    </section>
  );
}
