function halfToFloat(input) {
  const s = (input & 0x8000) >> 15;
  const e = (input & 0x7c00) >> 10;
  const f = input & 0x03ff;

  if (e === 0) {
    if (f === 0) {
      return s ? -0 : 0;
    }
    return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  }

  if (e === 31) {
    if (f === 0) {
      return s ? -Infinity : Infinity;
    }
    return NaN;
  }

  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

function decodeFloat16Slice(uint16Array, start, length) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = halfToFloat(uint16Array[start + i]);
  }
  return out;
}

function normalizeDistribution(arr) {
  const out = new Float32Array(arr.length);
  let sum = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const v = Math.max(arr[i], 1e-8);
    out[i] = v;
    sum += v;
  }
  const safeSum = Math.max(sum, 1e-8);
  for (let i = 0; i < out.length; i += 1) {
    out[i] /= safeSum;
  }
  return out;
}

function jsDivergence(mapA, mapB) {
  const p = normalizeDistribution(mapA);
  const q = normalizeDistribution(mapB);

  let klPM = 0;
  let klQM = 0;
  for (let i = 0; i < p.length; i += 1) {
    const m = 0.5 * (p[i] + q[i]);
    klPM += p[i] * Math.log(p[i] / m);
    klQM += q[i] * Math.log(q[i] / m);
  }
  return 0.5 * (klPM + klQM);
}

self.onmessage = (event) => {
  const { id, type } = event.data;

  try {
    if (type === 'decodeCross') {
      const { buffer, shape, tokenIndex } = event.data;
      if (!Array.isArray(shape) || shape.length !== 3) {
        throw new Error(`Cross attention shape must be [tokens, height, width], got ${String(shape)}`);
      }
      const [numTokens, height, width] = shape;

      if (tokenIndex < 0 || tokenIndex >= numTokens) {
        throw new Error(`Token index out of bounds: ${tokenIndex}`);
      }
      if (height <= 0 || width <= 0 || numTokens <= 0) {
        throw new Error(`Invalid cross attention shape: ${shape.join('x')}`);
      }

      const total = height * width;
      const start = tokenIndex * total;
      const raw = new Uint16Array(buffer);
      if (raw.length !== numTokens * total) {
        throw new Error(`Cross attention buffer length mismatch: expected ${numTokens * total}, got ${raw.length}`);
      }
      const decoded = decodeFloat16Slice(raw, start, total);
      self.postMessage({ id, ok: true, map: decoded, shape: [height, width] });
      return;
    }

    if (type === 'decodeSelf') {
      const { buffer, shape } = event.data;
      if (!Array.isArray(shape) || shape.length !== 2) {
        throw new Error(`Self attention shape must be [height, width], got ${String(shape)}`);
      }
      const [height, width] = shape;
      if (height <= 0 || width <= 0) {
        throw new Error(`Invalid self attention shape: ${shape.join('x')}`);
      }
      const total = height * width;
      const raw = new Uint16Array(buffer);
      if (raw.length !== total) {
        throw new Error(`Self attention buffer length mismatch: expected ${total}, got ${raw.length}`);
      }
      const decoded = decodeFloat16Slice(raw, 0, total);
      self.postMessage({ id, ok: true, map: decoded, shape: [height, width] });
      return;
    }

    if (type === 'jsDivergence') {
      const { mapA, mapB } = event.data;
      if (mapA.length !== mapB.length) {
        throw new Error('Map shapes do not match for JS divergence.');
      }
      const divergence = jsDivergence(mapA, mapB);
      self.postMessage({ id, ok: true, divergence });
      return;
    }

    throw new Error(`Unknown worker type: ${type}`);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
