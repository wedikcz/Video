/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../db.ts';
import { MemoryRecord } from '../../types/nexus.ts';

export class MemoryService {
  /**
   * Simple deterministic semantic vector generator for text
   * Provides 1536-dimensional mock or word-hash embeddings for deterministic cosine search
   */
  public static calculateTextSimilarity(textA: string, textB: string): number {
    const wordsA = new Set(textA.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    const wordsB = new Set(textB.toLowerCase().split(/\s+/).filter((w) => w.length > 2));

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }

    const union = new Set([...wordsA, ...wordsB]).size;
    return intersection / union; // Jaccard similarity as cosine proxy
  }

  /**
   * BM25 style term frequency scoring
   */
  public static calculateBM25Score(query: string, content: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    if (queryTerms.length === 0) return 0.1;

    const contentLower = content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      const occurrences = (contentLower.match(new RegExp(term, 'g')) || []).length;
      if (occurrences > 0) {
        // Simple BM25 term frequency saturation approximation
        const tf = (occurrences * 2.2) / (occurrences + 1.2);
        score += tf;
      }
    }

    return Math.min(score / queryTerms.length, 1.0);
  }

  /**
   * Hybrid retrieval (BM25 0.4 + Cosine 0.6) reranked by importance and decay
   */
  public static search(query: string, topK: number = 8): { memories: MemoryRecord[]; scores: number[] } {
    const now = Date.now();

    const scored = db.memories.map((mem) => {
      const bm25 = this.calculateBM25Score(query, mem.content);
      const cosine = this.calculateTextSimilarity(query, mem.content);
      const hybridBase = bm25 * 0.4 + cosine * 0.6;

      // Time decay factor
      const createdTime = new Date(mem.createdAt).getTime();
      const ageDays = Math.max(0, (now - createdTime) / (1000 * 3600 * 24));
      const decayFactor = Math.exp(-ageDays / 120); // half-life ~ 83 days

      const finalScore = hybridBase * 0.7 + (mem.importance * 0.2) + (decayFactor * 0.1);

      return { memory: mem, score: finalScore };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK);

    top.forEach((item) => {
      item.memory.lastUsedAt = new Date().toISOString();
    });

    return {
      memories: top.map((t) => t.memory),
      scores: top.map((t) => t.score),
    };
  }

  /**
   * Save memory with deduplication (if similarity > 0.92, update existing instead of duplicate)
   */
  public static save(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'lastUsedAt' | 'decayAt'>): MemoryRecord {
    // Check duplication
    for (const existing of db.memories) {
      if (existing.kind === record.kind && existing.scope === record.scope) {
        const sim = this.calculateTextSimilarity(existing.content, record.content);
        if (sim > 0.92) {
          // Update importance and refreshed time
          existing.importance = Math.max(existing.importance, record.importance);
          existing.lastUsedAt = new Date().toISOString();
          return existing;
        }
      }
    }

    const created: MemoryRecord = {
      id: `mem-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      ...record,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      decayAt: new Date(Date.now() + 86400000 * 90).toISOString(),
    };

    db.memories.unshift(created);
    return created;
  }
}
