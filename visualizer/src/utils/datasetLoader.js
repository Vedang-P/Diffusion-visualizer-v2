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
  return response.json();
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read binary file: ${file.name}`));
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(file);
  });
}

function makeLocalFileMap(files) {
  const map = new Map();
  for (const file of files) {
    const rel = normalizePath(file.webkitRelativePath || file.name);
    map.set(rel, file);

    const parts = rel.split('/');
    if (parts.length > 1) {
      map.set(parts.slice(1).join('/'), file);
    }
  }
  return map;
}

function resolveLocalFile(fileMap, path) {
  const normalized = normalizePath(path);
  if (fileMap.has(normalized)) {
    return fileMap.get(normalized);
  }
  for (const [candidate, file] of fileMap.entries()) {
    if (candidate.endsWith(normalized)) {
      return file;
    }
  }
  return null;
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

  const metrics = await fetchJson(`${normalizedBase}/metrics.json`);
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

export async function loadDatasetFromFiles(fileList) {
  const files = Array.from(fileList);
  const fileMap = makeLocalFileMap(files);

  const metadataFile =
    resolveLocalFile(fileMap, 'metadata.json') ||
    files.find((file) => file.name === 'metadata.json');

  if (!metadataFile) {
    throw new Error('Could not find metadata.json in selected folder.');
  }

  const metadata = JSON.parse(await readFileAsText(metadataFile));
  assertMetadataShape(metadata);

  const metricsFile = resolveLocalFile(fileMap, metadata.artifacts?.metrics || 'metrics.json');
  const pcaFile = resolveLocalFile(fileMap, metadata.artifacts?.latent_pca || 'latent_pca.json');

  if (!metricsFile || !pcaFile) {
    throw new Error('Selected folder is missing metrics.json or latent_pca.json.');
  }

  const metrics = JSON.parse(await readFileAsText(metricsFile));
  const latentPca = JSON.parse(await readFileAsText(pcaFile));
  const warnings = validateDatasetBundle(metadata, metrics, latentPca);

  return createDatasetObject({
    mode: 'local',
    fileMap,
    metadata,
    metrics,
    latentPca,
    warnings
  });
}

export function getAttentionEntry(dataset, attentionType, layerId, step) {
  return dataset.attentionLookup.get(`${attentionType}:${layerId}:${step}`) || null;
}

export async function getAttentionBuffer(dataset, path) {
  const normalizedPath = normalizePath(path);
  if (dataset.attentionBufferCache.has(normalizedPath)) {
    return dataset.attentionBufferCache.get(normalizedPath);
  }

  let buffer;
  if (dataset.mode === 'url') {
    const response = await fetch(`${dataset.baseUrl}/${normalizedPath}`, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`Failed to fetch attention asset: ${normalizedPath}`);
    }
    buffer = await response.arrayBuffer();
  } else {
    const file = resolveLocalFile(dataset.fileMap, normalizedPath);
    if (!file) {
      throw new Error(`Attention file not found in local dataset: ${normalizedPath}`);
    }
    buffer = await readFileAsArrayBuffer(file);
  }

  setCacheWithLimit(dataset.attentionBufferCache, normalizedPath, buffer, ATTENTION_BUFFER_CACHE_LIMIT);
  return buffer;
}

export function getImageSrc(dataset, step) {
  const path = dataset.metadata.images?.[step];
  if (!path) {
    return null;
  }

  if (dataset.mode === 'url') {
    return `${dataset.baseUrl}/${normalizePath(path)}`;
  }

  const normalizedPath = normalizePath(path);
  if (dataset.imageUrlCache.has(normalizedPath)) {
    return dataset.imageUrlCache.get(normalizedPath);
  }

  const file = resolveLocalFile(dataset.fileMap, normalizedPath);
  if (!file) {
    return null;
  }

  const objectUrl = URL.createObjectURL(file);
  dataset.imageUrlCache.set(normalizedPath, objectUrl);
  return objectUrl;
}

export function getCrossLayerIds(dataset) {
  return (dataset.metadata.layers || [])
    .filter((layer) => layer.attention_type === 'cross')
    .map((layer) => layer.id);
}

export function getSelfLayerIds(dataset) {
  return (dataset.metadata.layers || [])
    .filter((layer) => layer.attention_type === 'self')
    .map((layer) => layer.id);
}

export function cleanupDatasetResources(dataset) {
  if (!dataset) {
    return;
  }
  for (const [, url] of dataset.imageUrlCache || new Map()) {
    URL.revokeObjectURL(url);
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
