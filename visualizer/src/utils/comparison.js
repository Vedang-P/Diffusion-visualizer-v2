import { computeJsDivergence } from './attentionWorkerClient';

export function computeLatentTrajectoryDelta(pointsA, pointsB) {
  const length = Math.min(pointsA.length, pointsB.length);
  const delta = [];
  for (let i = 0; i < length; i += 1) {
    const dx = pointsA[i][0] - pointsB[i][0];
    const dy = pointsA[i][1] - pointsB[i][1];
    delta.push(Math.sqrt(dx * dx + dy * dy));
  }
  return delta;
}

export async function computeAttentionDivergence(mapA, mapB) {
  if (!mapA || !mapB) {
    return null;
  }
  const { divergence } = await computeJsDivergence(mapA, mapB);
  return divergence;
}
