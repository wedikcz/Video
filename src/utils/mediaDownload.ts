/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FactoryAsset } from '../types/nexus.ts';

export function buildDownloadFilename(asset: Pick<FactoryAsset, 'id' | 'title'>): string {
  const slug = (asset.title || 'video')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `nexus-video-${slug || 'output'}-${asset.id}.mp4`;
}

/**
 * Cross-platform MP4 download helper (Desktop + Mobile iOS/Android Safari/Chrome):
 * Fetches binary stream with `cache: 'no-store'`, wraps explicitly as `video/mp4` Blob,
 * and dispatches a safe anchor download with delayed objectURL cleanup.
 */
export async function downloadVideoAsset(asset: FactoryAsset): Promise<void> {
  const url = asset.downloadUrl || `/api/v1/assets/${asset.id}/download`;
  const filename = buildDownloadFilename(asset);

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(`Stažení MP4 selhalo (HTTP ${response.status}).`);
  }

  const rawBuffer = await response.arrayBuffer();
  if (rawBuffer.byteLength === 0) {
    throw new Error('Stažený MP4 soubor je prázdný.');
  }

  const mp4Blob = new Blob([rawBuffer], { type: 'video/mp4' });
  const objectUrl = URL.createObjectURL(mp4Blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  }
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
