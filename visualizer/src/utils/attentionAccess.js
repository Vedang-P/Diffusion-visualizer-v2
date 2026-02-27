import { decodeCrossTokenMap, decodeSelfMap } from './attentionWorkerClient';
import { getAttentionBuffer, getAttentionEntry } from './datasetLoader';

const DECODED_ATTENTION_CACHE_LIMIT = 160;

function cacheForDataset(dataset) {
  if (!dataset.decodedAttentionCache) {
    dataset.decodedAttentionCache = new Map();
  }
  return dataset.decodedAttentionCache;
}

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

export async function loadCrossTokenAttentionMap(dataset, layerId, step, tokenIndex) {
  const entry = getAttentionEntry(dataset, 'cross', layerId, step);
  if (!entry) {
    return null;
  }

  const cacheKey = `cross:${layerId}:${step}:${tokenIndex}`;
  const cache = cacheForDataset(dataset);
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const buffer = await getAttentionBuffer(dataset, entry.path);
  const { map, shape } = await decodeCrossTokenMap(buffer, entry.shape, tokenIndex);
  const result = { map, shape, layerId, step, tokenIndex };
  setCacheWithLimit(cache, cacheKey, result, DECODED_ATTENTION_CACHE_LIMIT);
  return result;
}

export async function loadSelfAttentionMap(dataset, layerId, step) {
  const entry = getAttentionEntry(dataset, 'self', layerId, step);
  if (!entry) {
    return null;
  }

  const cacheKey = `self:${layerId}:${step}`;
  const cache = cacheForDataset(dataset);
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const buffer = await getAttentionBuffer(dataset, entry.path);
  const { map, shape } = await decodeSelfMap(buffer, entry.shape);
  const result = { map, shape, layerId, step };
  setCacheWithLimit(cache, cacheKey, result, DECODED_ATTENTION_CACHE_LIMIT);
  return result;
}
