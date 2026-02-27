let worker = null;
let nextMessageId = 1;
const pending = new Map();
const REQUEST_TIMEOUT_MS = 30000;

function ensureWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/attentionWorker.js', import.meta.url), {
      type: 'module'
    });

    worker.onmessage = (event) => {
      const { id, ok, ...payload } = event.data;
      const entry = pending.get(id);
      if (!entry) {
        return;
      }
      pending.delete(id);
      window.clearTimeout(entry.timeoutHandle);
      if (ok) {
        entry.resolve(payload);
      } else {
        entry.reject(new Error(payload.error || 'Worker operation failed'));
      }
    };

    worker.onerror = (event) => {
      const reason = event?.message || 'Worker crashed';
      for (const [id, entry] of pending.entries()) {
        window.clearTimeout(entry.timeoutHandle);
        entry.reject(new Error(reason));
        pending.delete(id);
      }
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function workerRequest(type, payload) {
  const id = nextMessageId;
  nextMessageId += 1;

  const activeWorker = ensureWorker();
  return new Promise((resolve, reject) => {
    const timeoutHandle = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Worker request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    }, REQUEST_TIMEOUT_MS);

    pending.set(id, { resolve, reject, timeoutHandle });
    activeWorker.postMessage({ id, type, ...payload });
  });
}

export async function decodeCrossTokenMap(buffer, shape, tokenIndex) {
  return workerRequest('decodeCross', { buffer, shape, tokenIndex });
}

export async function decodeSelfMap(buffer, shape) {
  return workerRequest('decodeSelf', { buffer, shape });
}

export async function computeJsDivergence(mapA, mapB) {
  return workerRequest('jsDivergence', { mapA, mapB });
}

export function disposeAttentionWorker() {
  if (!worker) {
    return;
  }
  worker.terminate();
  worker = null;

  for (const [id, entry] of pending.entries()) {
    window.clearTimeout(entry.timeoutHandle);
    entry.reject(new Error('Worker terminated'));
    pending.delete(id);
  }
}
