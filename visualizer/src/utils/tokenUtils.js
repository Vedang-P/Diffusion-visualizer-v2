const SPECIAL_TOKEN_TEXT = new Set(['', '<|endoftext|>', '</s>', '<s>', '<pad>', '[PAD]']);

export function normalizeToken(token) {
  return String(token || '')
    .replace(/Ġ/g, ' ')
    .replace(/▁/g, ' ')
    .trim();
}

function isSpecialToken(token, tokenId) {
  const cleaned = String(token || '').trim();
  if (SPECIAL_TOKEN_TEXT.has(cleaned)) {
    return true;
  }

  // Common CLIP/SD special token ids
  if (tokenId === 0 || tokenId === 49406 || tokenId === 49407) {
    return true;
  }

  return false;
}

export function getMeaningfulTokenCount(dataset) {
  const metadataCount = dataset?.metadata?.prompt?.meaningful_token_count;
  const tokens = dataset?.metadata?.prompt?.tokens || [];
  const tokenIds = dataset?.metadata?.prompt?.token_ids || [];

  if (Number.isInteger(metadataCount) && metadataCount > 0 && metadataCount <= tokens.length) {
    return metadataCount;
  }

  let started = false;
  let count = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const tokenId = tokenIds[index];

    if (isSpecialToken(token, tokenId)) {
      if (started) {
        break;
      }
      continue;
    }

    started = true;
    count += 1;
  }

  return Math.max(1, Math.min(count || tokens.length, tokens.length));
}

export function getMeaningfulTokenSlice(dataset) {
  const tokens = dataset?.metadata?.prompt?.tokens || [];
  const count = getMeaningfulTokenCount(dataset);
  return tokens.slice(0, count);
}
