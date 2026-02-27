from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

import numpy as np
from sklearn.decomposition import PCA


EPS = 1e-8


def latent_l2_norm(latent: np.ndarray) -> float:
    return float(np.linalg.norm(latent.reshape(-1), ord=2))


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a_flat = a.reshape(-1).astype(np.float64)
    b_flat = b.reshape(-1).astype(np.float64)
    denom = (np.linalg.norm(a_flat) * np.linalg.norm(b_flat)) + EPS
    return float(np.dot(a_flat, b_flat) / denom)


def shannon_entropy(probabilities: np.ndarray, axis: int = -1) -> np.ndarray:
    p = np.clip(probabilities, EPS, 1.0)
    return -np.sum(p * np.log(p), axis=axis)


def mean_attention_entropy(attention_matrix: np.ndarray) -> float:
    # attention_matrix shape: [query_tokens, key_tokens]
    entropy_per_query = shannon_entropy(attention_matrix, axis=-1)
    return float(np.mean(entropy_per_query))


def mean_token_activation(attention_matrix: np.ndarray) -> np.ndarray:
    # mean activation for each text token
    return attention_matrix.mean(axis=0)


def token_importance_ranking(token_scores: np.ndarray, top_k: int = 20) -> list[dict]:
    indices = np.argsort(token_scores)[::-1][:top_k]
    return [
        {
            "token_index": int(i),
            "score": float(token_scores[i]),
        }
        for i in indices
    ]


@dataclass
class PcaResult:
    points: list[list[float]]
    explained_variance_ratio: list[float]


def compute_latent_pca(latents: Iterable[np.ndarray]) -> PcaResult:
    latent_list: List[np.ndarray] = [x.reshape(-1).astype(np.float32) for x in latents]

    if len(latent_list) == 0:
        return PcaResult(points=[], explained_variance_ratio=[0.0, 0.0])

    stacked = np.stack(latent_list, axis=0)
    if stacked.shape[0] == 1:
        return PcaResult(points=[[0.0, 0.0]], explained_variance_ratio=[1.0, 0.0])

    model = PCA(n_components=2)
    transformed = model.fit_transform(stacked)

    return PcaResult(
        points=transformed.astype(np.float32).tolist(),
        explained_variance_ratio=model.explained_variance_ratio_.astype(np.float32).tolist(),
    )


def kl_divergence(p: np.ndarray, q: np.ndarray) -> float:
    p_safe = np.clip(p.astype(np.float64), EPS, 1.0)
    q_safe = np.clip(q.astype(np.float64), EPS, 1.0)
    return float(np.sum(p_safe * np.log(p_safe / q_safe)))
