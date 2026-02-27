export const PRESET_ORDER = ['realistic', 'anime'];

export const DATASET_REGISTRY = {
  realistic: {
    id: 'realistic',
    label: 'Realistic Run',
    shortLabel: 'Realistic',
    baseUrl: './datasets/presets/realistic',
    accent: 'cyan',
    promptSnippet: 'Photoreal neon Tokyo alley with rain reflections and volumetric fog.'
  },
  anime: {
    id: 'anime',
    label: 'Anime Run',
    shortLabel: 'Anime',
    baseUrl: './datasets/presets/anime',
    accent: 'magenta',
    promptSnippet: 'Stylized neon Japanese street scene with anime composition and clean linework.'
  }
};

export function getPresetList() {
  return PRESET_ORDER.map((id) => DATASET_REGISTRY[id]);
}

export function resolvePreset(id) {
  return DATASET_REGISTRY[id] || DATASET_REGISTRY.realistic;
}
