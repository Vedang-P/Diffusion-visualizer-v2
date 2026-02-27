import { DATASET_REGISTRY } from '../config/presets';
import { parseJsonWithSanitization } from './safeJson';

const REQUIRED_METADATA_KEYS = ['schema_version', 'prompt', 'steps', 'images', 'layers', 'attention_files'];
const ATTENTION_BUFFER_CACHE_LIMIT = 80;

function setCacheWithLimit(cache, key, value, limit) {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function normalizePath(value) {
  return String(value || '')
    .replace(/^\.\//, '')
    .replace(/\\/g, '/');
}

function toFiniteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function sanitizeNumberArray(values) {
  return (values || []).map((value) => toFiniteOrNull(value));
}

function sanitizeAttentionEntropy(items) {
  return (items || []).map((item) => {
    if (!item || typeof item !== 'object') {
      return { step: null, mean: null, by_layer: {} };
    }

    const byLayer = {};
    for (const [key, value] of Object.entries(item.by_layer || {})) {
      byLayer[key] = toFiniteOrNull(value);
    }

    return {
      ...item,
      mean: toFiniteOrNull(item.mean),
      by_layer: byLayer
    };
  });
}

function sanitizeTokenActivations(items) {
  return (items || []).map((row) => sanitizeNumberArray(row));
}

function sanitizeMetrics(metrics) {
  return {
    ...metrics,
    latent_l2_norm: sanitizeNumberArray(metrics.latent_l2_norm),
    predicted_noise_l2_norm: sanitizeNumberArray(metrics.predicted_noise_l2_norm),
    cosine_similarity_to_previous: sanitizeNumberArray(metrics.cosine_similarity_to_previous),
    attention_kl_divergence: sanitizeNumberArray(metrics.attention_kl_divergence),
    cross_attention_entropy: sanitizeAttentionEntropy(metrics.cross_attention_entropy),
    self_attention_entropy: sanitizeAttentionEntropy(metrics.self_attention_entropy),
    mean_token_activation: sanitizeTokenActivations(metrics.mean_token_activation)
  };
}

function buildAttentionLookup(metadata) {
  const lookup = new Map();
  for (const entry of metadata.attention_files || []) {
    const key = `${entry.attention_type}:${entry.layer_id}:${entry.step}`;
    lookup.set(key, entry);
  }
  return lookup;
}

function assertMetadataShape(metadata) {
  for (const key of REQUIRED_METADATA_KEYS) {
    if (!(key in metadata)) {
      throw new Error(`metadata.json is missing required key: ${key}`);
    }
  }

  if (!Number.isInteger(metadata.steps) || metadata.steps <= 0) {
    throw new Error('metadata.steps must be a positive integer.');
  }
}

function validateDatasetBundle(metadata, metrics, latentPca) {
  const warnings = [];
  const steps = metadata.steps;

  if ((metadata.images || []).length !== steps) {
    warnings.push(`metadata.images length (${(metadata.images || []).length}) does not match metadata.steps (${steps}).`);
  }

  if ((latentPca.points || []).length !== steps) {
    warnings.push(`latent_pca.points length (${(latentPca.points || []).length}) does not match metadata.steps (${steps}).`);
  }

  if ((metrics.latent_l2_norm || []).length !== steps) {
    warnings.push(
      `metrics.latent_l2_norm length (${(metrics.latent_l2_norm || []).length}) does not match metadata.steps (${steps}).`
    );
  }

  const badAttentionEntries = (metadata.attention_files || []).filter((entry) => {
    if (!entry || typeof entry.path !== 'string' || !Array.isArray(entry.shape)) {
      return true;
    }
    if (entry.attention_type !== 'cross' && entry.attention_type !== 'self') {
      return true;
    }
    return entry.shape.some((dim) => !Number.isInteger(dim) || dim <= 0);
  });

  if (badAttentionEntries.length > 0) {
    throw new Error(`metadata.attention_files has ${badAttentionEntries.length} malformed entries.`);
  }

  return warnings;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }

  const text = await response.text();
  return parseJsonWithSanitization(text, url);
}

function createDatasetObject(base) {
  const attentionLookup = buildAttentionLookup(base.metadata);
  return {
    ...base,
    attentionLookup,
    attentionBufferCache: new Map(),
    imageUrlCache: new Map(),
    warnings: base.warnings || []
  };
}

export async function loadDatasetFromUrl(baseUrl) {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const metadata = await fetchJson(`${normalizedBase}/metadata.json`);
  assertMetadataShape(metadata);

  const metrics = sanitizeMetrics(await fetchJson(`${normalizedBase}/metrics.json`));
  const latentPca = await fetchJson(`${normalizedBase}/latent_pca.json`);
  const warnings = validateDatasetBundle(metadata, metrics, latentPca);

  return createDatasetObject({
    mode: 'url',
    baseUrl: normalizedBase,
    metadata,
    metrics,
    latentPca,
    warnings
  });
}

export async function loadPresetDataset(presetId) {
  const preset = DATASET_REGISTRY[presetId];
  if (!preset) {
    throw new Error(`Unknown preset id: ${String(presetId)}`);
  }

  const dataset = await loadDatasetFromUrl(preset.baseUrl);
  return {
    ...dataset,
    preset
  };
}

export function getAttentionEntry(dataset, attentionType, layerId, step) {
  return dataset.attentionLookup.get(`${attentionType}:${layerId}:${step}`) || null;
}

export async function getAttentionBuffer(dataset, path) {
  const normalizedPath = normalizePath(path);
  if (dataset.attentionBufferCache.has(normalizedPath)) {
    return dataset.attentionBufferCache.get(normalizedPath);
  }

  const response = await fetch(`${dataset.baseUrl}/${normalizedPath}`, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch attention asset: ${normalizedPath}`);
  }
  const buffer = await response.arrayBuffer();

  setCacheWithLimit(dataset.attentionBufferCache, normalizedPath, buffer, ATTENTION_BUFFER_CACHE_LIMIT);
  return buffer;
}

export function getImageSrc(dataset, step) {
  const path = dataset.metadata.images?.[step];
  if (!path) {
    return null;
  }

  return `${dataset.baseUrl}/${normalizePath(path)}`;
}

export function getCrossLayerIds(dataset) {
  return (dataset.metadata.layers || [])
    .filter((layer) => layer.attention_type === 'cross')
    .map((layer) => layer.id);
}

export function cleanupDatasetResources(dataset) {
  if (!dataset) {
    return;
  }

  if (dataset.imageUrlCache) {
    dataset.imageUrlCache.clear();
  }
  if (dataset.attentionBufferCache) {
    dataset.attentionBufferCache.clear();
  }
  if (dataset.decodedAttentionCache) {
    dataset.decodedAttentionCache.clear();
  }
}
