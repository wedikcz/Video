/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { db } from '../server/db.ts';
import { MemoryService } from '../server/runtime/memory.ts';
import { MediaRenderer } from '../server/runtime/mediaRenderer.ts';
import { MoviePyCompiler } from '../server/runtime/moviepy.ts';
import { VideoDirectorEngine } from '../server/runtime/videoDirector.ts';
import { createPendingVideoAsset, executeVideoRenderJob } from '../server/runtime/videoJobRunner.ts';
import {
  FactoryAsset,
  McpAuditEntry,
  McpEndpointRecord,
  McpTransportType,
  MultiGenArtifact,
  MultiGenArtifactType,
  SelfHealingEvent,
} from '../types/nexus.ts';

const MAX_MCP_OUTPUT_CHARS = 8000;

export const UNSAFE_SHELL_META_REGEX = /[;&|`$><\r\n\\]/;
export const PATH_TRAVERSAL_REGEX = /(^|[\\/])\.\.([\\/]|$)/;

const MODEL_ALIASES: Record<string, string> = {
  'wan2.2': 'wan-2-2',
  'wan-2.2': 'wan-2-2',
  'wan_2_2': 'wan-2-2',
  'ltx2.5': 'ltx-2-5',
  'ltx-2.5': 'ltx-2-5',
  'ltx_2_5': 'ltx-2-5',
  'flux2': 'flux-2-pro',
  'veo3.1': 'veo-3-1',
  'local': 'nexus-local-director',
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function recordAudit(entry: Omit<McpAuditEntry, 'id' | 'timestamp'>): McpAuditEntry {
  const full: McpAuditEntry = {
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  db.mcpAuditLogs.unshift(full);
  if (db.mcpAuditLogs.length > 200) db.mcpAuditLogs.length = 200;
  return full;
}

function recordSelfHealing(event: Omit<SelfHealingEvent, 'id' | 'timestamp'>): SelfHealingEvent {
  const full: SelfHealingEvent = {
    id: `heal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...event,
  };
  db.selfHealingEvents.unshift(full);
  if (db.selfHealingEvents.length > 120) db.selfHealingEvents.length = 120;
  MemoryService.save({
    kind: 'procedural',
    scope: 'business',
    content: `[Self-Healing Lesson] ${event.source}: ${event.issue} -> ${event.repairAction}`,
    importance: 0.88,
  });
  return full;
}

export function normalizeMcpOutput<T>(payload: T): {
  data: T | { truncated: true; originalLength: number; summary: string; preview: string };
  truncated: boolean;
} {
  const serialized = JSON.stringify(payload);
  if (serialized.length <= MAX_MCP_OUTPUT_CHARS) {
    return { data: payload, truncated: false };
  }
  const preview = serialized.slice(0, MAX_MCP_OUTPUT_CHARS - 260);
  return {
    truncated: true,
    data: {
      truncated: true,
      originalLength: serialized.length,
      summary: `Výstup (${serialized.length} znaků) byl zkrácen na ${MAX_MCP_OUTPUT_CHARS} znaků pro ochranu kontextového okna LLM.`,
      preview,
    },
  };
}

export function healMultiGenParameters(input: {
  type?: string;
  modelId?: string;
  prompt?: string;
  aspectRatio?: string;
  durationSec?: number;
  captionTop?: string;
  captionBottom?: string;
}): {
  healed: {
    type: MultiGenArtifactType;
    modelId: string;
    prompt: string;
    aspectRatio: '9:16' | '16:9' | '1:1';
    durationSec: number;
    captionTop?: string;
    captionBottom?: string;
  };
  healingEvents: SelfHealingEvent[];
} {
  const events: SelfHealingEvent[] = [];

  // 1. Heal generation type
  const rawType = String(input.type || 'image').toLowerCase().trim();
  const validTypes: MultiGenArtifactType[] = ['image', 'video', 'movie', 'sketch', 'meme'];
  let resolvedType: MultiGenArtifactType = 'image';
  if (validTypes.includes(rawType as MultiGenArtifactType)) {
    resolvedType = rawType as MultiGenArtifactType;
  } else {
    const aliasMap: Record<string, MultiGenArtifactType> = {
      img: 'image',
      photo: 'image',
      film: 'movie',
      cinema: 'movie',
      movies: 'movie',
      sketches: 'sketch',
      wireframe: 'sketch',
      memes: 'meme',
      vid: 'video',
    };
    resolvedType = aliasMap[rawType] || 'image';
    events.push(
      recordSelfHealing({
        source: 'multigen_router',
        issue: `Neznámý typ generace "${rawType}"`,
        repairAction: `Automaticky opraveno na "${resolvedType}"`,
        originalValue: rawType,
        repairedValue: resolvedType,
        status: 'repaired',
      })
    );
  }

  // 2. Heal modelId aliases (WAN-2.2 / LTX-2.5) or missing models
  const rawModel = String(input.modelId || 'wan-2-2').trim();
  const normalizedAlias = MODEL_ALIASES[rawModel.toLowerCase()] || rawModel;
  const matchedModel = db.openGenModels.find((m) => m.id === normalizedAlias);
  let resolvedModelId = matchedModel ? matchedModel.id : 'wan-2-2';
  if (!matchedModel || normalizedAlias !== rawModel) {
    events.push(
      recordSelfHealing({
        source: 'model_selector',
        issue: matchedModel
          ? `Alias modelu "${rawModel}" normalizován`
          : `Neexistující model "${rawModel}" v lokálním registru`,
        repairAction: `Přepnuto na validní model "${resolvedModelId}"`,
        originalValue: rawModel,
        repairedValue: resolvedModelId,
        status: matchedModel ? 'repaired' : 'circuit_fallback',
      })
    );
  }

  // 3. Heal aspect ratio
  const rawRatio = String(input.aspectRatio || '').trim();
  let resolvedRatio: '9:16' | '16:9' | '1:1' =
    resolvedType === 'video' ? '9:16' : resolvedType === 'movie' ? '16:9' : '1:1';
  if (rawRatio === '9:16' || rawRatio === '16:9' || rawRatio === '1:1') {
    resolvedRatio = rawRatio;
  } else if (rawRatio) {
    events.push(
      recordSelfHealing({
        source: 'aspect_ratio_guard',
        issue: `Nepodporovaný poměr stran "${rawRatio}"`,
        repairAction: `Parametr opraven na "${resolvedRatio}" pro typ "${resolvedType}"`,
        originalValue: rawRatio,
        repairedValue: resolvedRatio,
        status: 'repaired',
      })
    );
  }

  // 4. Heal durationSec
  const rawDuration = Number(input.durationSec ?? (resolvedType === 'movie' ? 12 : 6));
  const minD = 3;
  const maxD = resolvedType === 'movie' ? 20 : 15;
  let resolvedDuration = Number.isFinite(rawDuration) ? Math.round(rawDuration) : 6;
  if (resolvedDuration < minD || resolvedDuration > maxD) {
    const clamped = Math.max(minD, Math.min(maxD, resolvedDuration));
    events.push(
      recordSelfHealing({
        source: 'duration_clamp',
        issue: `Stopáž ${rawDuration}s mimo povolený rozsah ${minD}–${maxD}s`,
        repairAction: `Stopáž korigována na ${clamped}s`,
        originalValue: rawDuration,
        repairedValue: clamped,
        status: 'repaired',
      })
    );
    resolvedDuration = clamped;
  }

  // 5. Heal prompt
  const rawPrompt = String(input.prompt || '').trim();
  let resolvedPrompt = rawPrompt;
  if (!resolvedPrompt || resolvedPrompt.length < 3) {
    resolvedPrompt =
      resolvedType === 'meme'
        ? 'Když AI agent automaticky opraví produkční pipeline ve 3 ráno'
        : resolvedType === 'sketch'
          ? 'Architektonický koncept futuristického robotického studia'
          : 'Futuristický kyberpunk neonový portrét AI režiséra';
    events.push(
      recordSelfHealing({
        source: 'prompt_bootstrap',
        issue: 'Prázdný nebo příliš krátký prompt',
        repairAction: 'Vygenerován kontextový fallback prompt',
        originalValue: rawPrompt,
        repairedValue: resolvedPrompt,
        status: 'repaired',
      })
    );
  }

  return {
    healed: {
      type: resolvedType,
      modelId: resolvedModelId,
      prompt: resolvedPrompt,
      aspectRatio: resolvedRatio,
      durationSec: resolvedDuration,
      captionTop: input.captionTop?.trim(),
      captionBottom: input.captionBottom?.trim(),
    },
    healingEvents: events,
  };
}

function buildMultiGenSvgPreview(params: {
  type: 'image' | 'sketch' | 'meme';
  modelId: string;
  modelName: string;
  prompt: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  captionTop?: string;
  captionBottom?: string;
}): { dataUri: string; captionTop?: string; captionBottom?: string } {
  const width = params.aspectRatio === '16:9' ? 800 : params.aspectRatio === '9:16' ? 540 : 640;
  const height = params.aspectRatio === '16:9' ? 450 : params.aspectRatio === '9:16' ? 960 : 640;
  const safePrompt = escapeXml(params.prompt.slice(0, 74));
  const safeModel = escapeXml(params.modelName);

  if (params.type === 'sketch') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0b1120"/>
  <defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#1e293b" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#grid)"/>
  <g stroke="#38bdf8" stroke-width="1.8" fill="none" opacity="0.88">
    <rect x="48" y="48" width="${width - 96}" height="${height - 96}" rx="12" stroke-dasharray="8 6"/>
    <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.25}"/>
    <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.14}" stroke-dasharray="5 4"/>
    <line x1="48" y1="${height / 2}" x2="${width - 48}" y2="${height / 2}" stroke-opacity="0.4"/>
    <line x1="${width / 2}" y1="48" x2="${width / 2}" y2="${height - 48}" stroke-opacity="0.4"/>
    <polygon points="${width / 2},${height * 0.22} ${width * 0.72},${height * 0.68} ${width * 0.28},${height * 0.68}" stroke="#34d399" stroke-width="2"/>
  </g>
  <text x="64" y="88" fill="#38bdf8" font-family="monospace" font-size="16" font-weight="bold">BLUEPRINT SKETCH · ${safeModel}</text>
  <text x="64" y="${height - 72}" fill="#e2e8f0" font-family="monospace" font-size="14">${safePrompt}</text>
</svg>`;
    return { dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
  }

  if (params.type === 'meme') {
    const words = params.prompt.trim().split(/\s+/);
    const half = Math.max(1, Math.ceil(words.length / 2));
    const topLine = escapeXml((params.captionTop || words.slice(0, half).join(' ')).toUpperCase().slice(0, 42));
    const bottomLine = escapeXml(
      (params.captionBottom || words.slice(half).join(' ') || 'AUTOPILOT HOTOVO ⚡').toUpperCase().slice(0, 42)
    );
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="memebg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#18181b"/>
      <stop offset="50%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#065f46"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#memebg)"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.26}" fill="#0f172a" stroke="#facc15" stroke-width="4"/>
  <text x="${width / 2}" y="${height / 2 + 12}" text-anchor="middle" fill="#facc15" font-family="monospace" font-size="38" font-weight="900">AI CEO</text>
  <text x="${width / 2}" y="76" text-anchor="middle" fill="#ffffff" stroke="#000000" stroke-width="5" paint-order="stroke" font-family="sans-serif" font-size="26" font-weight="900">${topLine}</text>
  <text x="${width / 2}" y="${height - 46}" text-anchor="middle" fill="#facc15" stroke="#000000" stroke-width="5" paint-order="stroke" font-family="sans-serif" font-size="26" font-weight="900">${bottomLine}</text>
  <text x="20" y="${height - 14}" fill="#a1a1aa" font-family="monospace" font-size="11">${safeModel} · MEME ENGINE</text>
</svg>`;
    return {
      dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      captionTop: topLine,
      captionBottom: bottomLine,
    };
  }

  // Image or Futuristic Avatar
  const isAvatar =
    params.prompt.toLowerCase().includes('avatar') ||
    params.aspectRatio === '1:1';

  if (isAvatar) {
    if (params.modelId === 'wan-2-2') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="wanbg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#082f49"/>
      <stop offset="45%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>
    <linearGradient id="wancyan" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="50%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#818cf8"/>
    </linearGradient>
    <radialGradient id="wanvisor" cx="50%" cy="40%" r="35%">
      <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.9"/>
      <stop offset="60%" stop-color="#3b82f6" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#082f49" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#wanbg)"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.46}" fill="none" stroke="#1e293b" stroke-width="2"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.42}" fill="none" stroke="#0284c7" stroke-width="2.5" stroke-dasharray="14 10" opacity="0.85"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.36}" fill="none" stroke="#818cf8" stroke-width="1.5" stroke-dasharray="6 6" opacity="0.6"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.32}" fill="url(#wanvisor)"/>
  <!-- Cyber Android Face Shield -->
  <polygon points="${width * 0.5},${height * 0.22} ${width * 0.76},${height * 0.36} ${width * 0.7},${height * 0.68} ${width * 0.5},${height * 0.8} ${width * 0.3},${height * 0.68} ${width * 0.24},${height * 0.36}" fill="#090d16" stroke="url(#wancyan)" stroke-width="3"/>
  <!-- Glowing Cyber Visor Eyes -->
  <path d="M ${width * 0.36} ${height * 0.42} L ${width * 0.47} ${height * 0.42} L ${width * 0.44} ${height * 0.47} L ${width * 0.38} ${height * 0.47} Z" fill="#00f0ff"/>
  <path d="M ${width * 0.64} ${height * 0.42} L ${width * 0.53} ${height * 0.42} L ${width * 0.56} ${height * 0.47} L ${width * 0.62} ${height * 0.47} Z" fill="#00f0ff"/>
  <line x1="${width * 0.32}" y1="${height * 0.445}" x2="${width * 0.68}" y2="${height * 0.445}" stroke="#00f0ff" stroke-width="1.5" opacity="0.75"/>
  <!-- Quantum Circuits -->
  <line x1="${width * 0.5}" y1="${height * 0.22}" x2="${width * 0.5}" y2="${height * 0.38}" stroke="#38bdf8" stroke-width="2"/>
  <circle cx="${width * 0.5}" cy="${height * 0.38}" r="4" fill="#38bdf8"/>
  <line x1="${width * 0.5}" y1="${height * 0.54}" x2="${width * 0.5}" y2="${height * 0.74}" stroke="#818cf8" stroke-width="2"/>
  <circle cx="${width * 0.5}" cy="${height * 0.74}" r="4" fill="#818cf8"/>
  <!-- HUD Insignia -->
  <rect x="${width * 0.2}" y="${height * 0.83}" width="${width * 0.6}" height="28" rx="6" fill="#030712" fill-opacity="0.88" stroke="#0284c7" stroke-width="1.5"/>
  <text x="${width * 0.5}" y="${height * 0.83 + 19}" text-anchor="middle" fill="#00f0ff" font-family="monospace" font-size="14" font-weight="900" letter-spacing="1">WAN-2.2 TURBO</text>
  <text x="${width * 0.5}" y="${height * 0.14}" text-anchor="middle" fill="#38bdf8" font-family="monospace" font-size="10" font-weight="bold" letter-spacing="2">ALIBABA OPENGEN · AI AVATAR</text>
</svg>`;
      return { dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
    }

    if (params.modelId === 'ltx-2-5') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="ltxbg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#451a03"/>
      <stop offset="45%" stop-color="#18181b"/>
      <stop offset="100%" stop-color="#09090b"/>
    </radialGradient>
    <linearGradient id="ltxgold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="50%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <radialGradient id="ltxiris" cx="50%" cy="50%" r="40%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.95"/>
      <stop offset="50%" stop-color="#f59e0b" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#09090b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#ltxbg)"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.46}" fill="none" stroke="#27272a" stroke-width="2"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.42}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="16 8" opacity="0.88"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.36}" fill="none" stroke="#10b981" stroke-width="1.8" stroke-dasharray="8 6" opacity="0.75"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.28}" fill="url(#ltxiris)"/>
  <!-- Cinematic Camera Aperture Iris Blades -->
  <polygon points="${width * 0.5},${height * 0.26} ${width * 0.72},${height * 0.4} ${width * 0.65},${height * 0.68} ${width * 0.5},${height * 0.74} ${width * 0.35},${height * 0.68} ${width * 0.28},${height * 0.4}" fill="#18181b" stroke="url(#ltxgold)" stroke-width="2.8"/>
  <circle cx="${width * 0.5}" cy="${height * 0.49}" r="${width * 0.15}" fill="#09090b" stroke="#10b981" stroke-width="2.5"/>
  <circle cx="${width * 0.5}" cy="${height * 0.49}" r="${width * 0.07}" fill="#10b981"/>
  <!-- Crosshairs -->
  <line x1="${width * 0.22}" y1="${height * 0.49}" x2="${width * 0.78}" y2="${height * 0.49}" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.8"/>
  <line x1="${width * 0.5}" y1="${height * 0.22}" x2="${width * 0.5}" y2="${height * 0.76}" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.8"/>
  <!-- HUD Insignia -->
  <rect x="${width * 0.2}" y="${height * 0.83}" width="${width * 0.6}" height="28" rx="6" fill="#09090b" fill-opacity="0.9" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="${width * 0.5}" y="${height * 0.83 + 19}" text-anchor="middle" fill="#fbbf24" font-family="monospace" font-size="14" font-weight="900" letter-spacing="1">LTX-VIDEO 2.5</text>
  <text x="${width * 0.5}" y="${height * 0.14}" text-anchor="middle" fill="#10b981" font-family="monospace" font-size="10" font-weight="bold" letter-spacing="2">LIGHTRICKS · CINEMATIC AI</text>
</svg>`;
      return { dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
    }
  }

  // Standard Image
  const isLtx = params.modelId === 'ltx-2-5';
  const c1 = isLtx ? '#451a03' : '#082f49';
  const c2 = isLtx ? '#fbbf24' : '#22d3ee';
  const c3 = isLtx ? '#10b981' : '#a855f7';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="imgbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#09090b"/>
      <stop offset="55%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="#09090b"/>
    </linearGradient>
    <radialGradient id="orb" cx="50%" cy="46%" r="44%">
      <stop offset="0%" stop-color="${c2}" stop-opacity="0.7"/>
      <stop offset="60%" stop-color="${c3}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#09090b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#imgbg)"/>
  <rect width="100%" height="100%" fill="url(#orb)"/>
  <circle cx="${width / 2}" cy="${height * 0.45}" r="${Math.min(width, height) * 0.22}" fill="none" stroke="${c2}" stroke-width="2.5" stroke-opacity="0.8"/>
  <circle cx="${width / 2}" cy="${height * 0.45}" r="${Math.min(width, height) * 0.13}" fill="none" stroke="${c3}" stroke-width="2" stroke-dasharray="10 6"/>
  <rect x="28" y="28" width="${width - 56}" height="32" rx="6" fill="#09090b" fill-opacity="0.72" stroke="${c2}" stroke-opacity="0.45"/>
  <text x="42" y="49" fill="${c2}" font-family="monospace" font-size="13" font-weight="bold">NEXUS MULTIGEN IMAGE · ${safeModel}</text>
  <rect x="28" y="${height - 76}" width="${width - 56}" height="48" rx="8" fill="#09090b" fill-opacity="0.78" stroke="#27272a"/>
  <text x="42" y="${height - 47}" fill="#f4f4f5" font-family="sans-serif" font-size="14">${safePrompt}</text>
</svg>`;
  return { dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
}

export async function runMultiGenToolkit(input: {
  type?: MultiGenArtifactType | string;
  modelId?: string;
  prompt?: string;
  aspectRatio?: '9:16' | '16:9' | '1:1' | string;
  durationSec?: number;
  threadId?: string;
  captionTop?: string;
  captionBottom?: string;
  dryRun?: boolean;
}): Promise<{
  artifact: MultiGenArtifact;
  asset: FactoryAsset;
  healingEvents: SelfHealingEvent[];
}> {
  const startedAt = Date.now();
  const { healed, healingEvents } = healMultiGenParameters(input);
  const modelSpec = db.openGenModels.find((m) => m.id === healed.modelId) || db.openGenModels[0];
  const threadId = input.threadId || 'th-main-001';

  const isMotion = healed.type === 'video' || healed.type === 'movie';
  const ownerAgentId = isMotion ? 'agent-video' : 'agent-visual';
  const ownerAgentName = isMotion ? 'Video Agent' : 'Visual Agent';

  if (isMotion) {
    const ratioForVideo: '9:16' | '16:9' = healed.aspectRatio === '16:9' || healed.type === 'movie' ? '16:9' : '9:16';
    const analyzed = await VideoDirectorEngine.analyzePrompt({
      userMessage: `${healed.prompt} ${ratioForVideo} ${healed.type === 'movie' ? 'cinematic film' : ''}`,
      forceDefaults: true,
    });
    const brief = {
      ...analyzed.brief,
      aspectRatio: ratioForVideo,
      durationSec: healed.durationSec,
      visualStyle: healed.type === 'movie' ? ('luxury_gold' as const) : analyzed.brief.visualStyle,
    };
    const storyboard = MoviePyCompiler.createBriefDrivenStoryboard(brief);
    const moviePyScript = MoviePyCompiler.generatePythonScript(storyboard);
    const assetId = `asset-mg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

    const pendingAsset = createPendingVideoAsset({
      assetId,
      threadId,
      prompt: healed.prompt,
      aspectRatio: ratioForVideo,
      brief,
      storyboard,
      moviePyScript,
      dryRun: Boolean(input.dryRun),
    });

    pendingAsset.title = `[${modelSpec.name} · ${healed.type.toUpperCase()}] ${storyboard.title}`;
    pendingAsset.modelId = modelSpec.id;
    pendingAsset.multiGenType = healed.type;
    pendingAsset.createdByAgentId = ownerAgentId;
    pendingAsset.createdByAgentName = ownerAgentName;
    pendingAsset.revenueGeneratedCzk = healed.type === 'movie' ? 3800 : 2450;
    pendingAsset.tags = ['MultiGen', healed.type.toUpperCase(), modelSpec.name, ratioForVideo, '+faststart'];

    db.factoryAssets.unshift(pendingAsset);

    const rendered = await executeVideoRenderJob({
      asset: pendingAsset,
      threadId,
      aspectRatio: ratioForVideo,
      brief,
      storyboard,
      topic: healed.prompt,
      dryRun: Boolean(input.dryRun),
    });

    const artifact: MultiGenArtifact = {
      id: `mg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      type: healed.type,
      modelId: modelSpec.id,
      modelName: modelSpec.name,
      title: rendered.asset.title,
      prompt: healed.prompt,
      aspectRatio: healed.aspectRatio,
      assetId: rendered.asset.id,
      streamUrl: rendered.asset.streamUrl,
      downloadUrl: rendered.asset.downloadUrl,
      scenesCount: storyboard.scenes.length,
      durationSec: rendered.asset.durationSec,
      healingEvents,
      createdByAgentId: ownerAgentId,
      createdByAgentName: ownerAgentName,
      revenueGeneratedCzk: rendered.asset.revenueGeneratedCzk || 2450,
      createdAt: new Date().toISOString(),
    };

    db.multiGenArtifacts.unshift(artifact);
    recordAudit({
      kind: 'multigen_run',
      toolOrMethod: `multigen:${healed.type}:${modelSpec.id}`,
      status: healingEvents.length > 0 ? 'repaired' : 'ok',
      latencyMs: Date.now() - startedAt,
      detail: `Vygenerováno ${healed.type} (${modelSpec.name}), MP4 asset ${rendered.asset.id}`,
    });

    return { artifact, asset: rendered.asset, healingEvents };
  }

  // Visual static modalities: image | sketch | meme
  const preview = buildMultiGenSvgPreview({
    type: healed.type as 'image' | 'sketch' | 'meme',
    modelId: modelSpec.id,
    modelName: modelSpec.name,
    prompt: healed.prompt,
    aspectRatio: healed.aspectRatio,
    captionTop: healed.captionTop,
    captionBottom: healed.captionBottom,
  });

  const assetId = `asset-mg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const revenueGeneratedCzk = healed.type === 'meme' ? 1850 : healed.type === 'image' ? 1450 : 950;
  const newAsset: FactoryAsset = {
    id: assetId,
    threadId,
    line: 'ad',
    title: `[${modelSpec.name} · ${healed.type.toUpperCase()}] ${healed.prompt.slice(0, 48)}`,
    prompt: healed.prompt,
    body:
      healed.type === 'meme'
        ? `Meme horní text: "${preview.captionTop}" | Spodní text: "${preview.captionBottom}"`
        : `${healed.type.toUpperCase()} artefakt vygenerovaný modelem ${modelSpec.name} (${healed.aspectRatio}).`,
    meta: `${modelSpec.name} · ${healed.type.toUpperCase()} · ${healed.aspectRatio}`,
    tags: ['MultiGen', healed.type.toUpperCase(), modelSpec.name, healed.aspectRatio],
    status: 'ready',
    mimeType: 'image/svg+xml',
    modelId: modelSpec.id,
    multiGenType: healed.type,
    previewSvgDataUri: preview.dataUri,
    createdByAgentId: ownerAgentId,
    createdByAgentName: ownerAgentName,
    revenueGeneratedCzk,
    createdAt: new Date().toISOString(),
    dryRun: Boolean(input.dryRun),
  };
  db.factoryAssets.unshift(newAsset);

  const artifact: MultiGenArtifact = {
    id: `mg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    type: healed.type,
    modelId: modelSpec.id,
    modelName: modelSpec.name,
    title: newAsset.title,
    prompt: healed.prompt,
    aspectRatio: healed.aspectRatio,
    assetId: newAsset.id,
    previewSvgDataUri: preview.dataUri,
    captionTop: preview.captionTop,
    captionBottom: preview.captionBottom,
    healingEvents,
    createdByAgentId: ownerAgentId,
    createdByAgentName: ownerAgentName,
    revenueGeneratedCzk,
    createdAt: new Date().toISOString(),
  };

  db.multiGenArtifacts.unshift(artifact);
  db.activities.unshift({
    id: `act-${Date.now()}-mg`,
    title: `MultiGen ${healed.type.toUpperCase()} (${modelSpec.name})`,
    description: `${newAsset.title} · Připsáno agentovi ${ownerAgentName} (${revenueGeneratedCzk} Kč)`,
    agent: ownerAgentName,
    timestamp: new Date().toISOString(),
    type: 'action',
  });

  recordAudit({
    kind: 'multigen_run',
    toolOrMethod: `multigen:${healed.type}:${modelSpec.id}`,
    status: healingEvents.length > 0 ? 'repaired' : 'ok',
    latencyMs: Date.now() - startedAt,
    detail: `Vygenerováno ${healed.type} (${modelSpec.name}), asset ${newAsset.id}`,
  });

  return { artifact, asset: newAsset, healingEvents };
}

export const EndpointGenerateSchema = z.object({
  name: z.string().min(2).max(64),
  transport: z.enum(['httpx_webhook', 'stdio', 'streamable_http']).default('httpx_webhook'),
  targetUrlOrCommand: z.string().min(3).max(240),
  authMode: z.enum(['hmac_sha256', 'bearer', 'none']).default('hmac_sha256'),
  timeoutMs: z.number().int().min(500).max(60000).default(10000),
  maxRetries: z.number().int().min(0).max(5).default(3),
});

export function validateEndpointSafety(input: {
  name: string;
  transport: McpTransportType;
  targetUrlOrCommand: string;
}): { valid: boolean; reason?: string } {
  if (UNSAFE_SHELL_META_REGEX.test(input.name) || UNSAFE_SHELL_META_REGEX.test(input.targetUrlOrCommand)) {
    return {
      valid: false,
      reason: 'Detekovány nepovolené shell metaznaky (;|&$`><\\). Bezpečnostní sandbox blokuje příkazovou injekci.',
    };
  }
  if (PATH_TRAVERSAL_REGEX.test(input.targetUrlOrCommand) || PATH_TRAVERSAL_REGEX.test(input.name)) {
    return {
      valid: false,
      reason: 'Detekován pokus o path traversal (..). Použijte validní relativní cestu nebo HTTPS URL.',
    };
  }
  if (input.transport !== 'stdio') {
    if (!/^https?:\/\/[a-zA-Z0-9._:-]+(\/.*)?$/i.test(input.targetUrlOrCommand)) {
      return {
        valid: false,
        reason: 'Pro HTTP/Webhook transport musí být cíl platná http:// nebo https:// adresa.',
      };
    }
  } else {
    const allowedBins = ['python3', 'node', 'npx', 'uvx', 'tsx'];
    const firstToken = input.targetUrlOrCommand.trim().split(/\s+/)[0];
    if (!allowedBins.includes(firstToken)) {
      return {
        valid: false,
        reason: `Stdio transport povoluje pouze whitelistované binárky (${allowedBins.join(', ')}).`,
      };
    }
  }
  return { valid: true };
}

export function generateAdaptableMcpEndpoint(rawInput: {
  name: string;
  transport?: McpTransportType;
  targetUrlOrCommand: string;
  authMode?: 'hmac_sha256' | 'bearer' | 'none';
  timeoutMs?: number;
  maxRetries?: number;
}): McpEndpointRecord {
  const startedAt = Date.now();
  const parsed = EndpointGenerateSchema.parse(rawInput);
  const safety = validateEndpointSafety(parsed);
  if (!safety.valid) {
    recordAudit({
      kind: 'security_block',
      toolOrMethod: 'mcp_generate_endpoint',
      status: 'blocked',
      latencyMs: Date.now() - startedAt,
      detail: safety.reason || 'Bezpečnostní blokace vstupu.',
    });
    throw new Error(safety.reason);
  }

  const slug = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'nexus-endpoint';

  const httpxPythonCode = `import asyncio
import hashlib
import hmac
import json
import os
import httpx

ENDPOINT_URL = "${parsed.transport === 'stdio' ? 'http://localhost:3000/v1/mcp/rpc' : parsed.targetUrlOrCommand}"
TIMEOUT_SEC = ${(parsed.timeoutMs / 1000).toFixed(1)}
MAX_RETRIES = ${parsed.maxRetries}

async def call_adaptable_mcp_webhook(tool_name: str, arguments: dict) -> dict:
    payload = {
        "jsonrpc": "2.0",
        "id": f"req-{tool_name}",
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments},
    }
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "X-Nexus-Endpoint": "${slug}"}
    ${
      parsed.authMode === 'hmac_sha256'
        ? `secret = os.environ.get("NEXUS_WEBHOOK_SECRET", "dev-secret").encode("utf-8")
    headers["X-Nexus-Signature"] = hmac.new(secret, body_bytes, hashlib.sha256).hexdigest()`
        : parsed.authMode === 'bearer'
          ? `headers["Authorization"] = f"Bearer {os.environ.get('NEXUS_API_TOKEN', '')}"`
          : '# No authentication header configured'
    }

    async with httpx.AsyncClient(timeout=TIMEOUT_SEC) as client:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = await client.post(ENDPOINT_URL, content=body_bytes, headers=headers)
                resp.raise_for_status()
                return resp.json()
            except (httpx.TimeoutException, httpx.HTTPStatusError) as exc:
                if attempt == MAX_RETRIES:
                    raise RuntimeError(f"Self-healing retries exhausted: {exc}") from exc
                await asyncio.sleep(0.4 * attempt)
`;

  const typescriptClientCode = `export async function invoke${slug
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')}(method: string, params: Record<string, unknown>) {
  const res = await fetch('${parsed.transport === 'stdio' ? '/v1/mcp/rpc' : parsed.targetUrlOrCommand}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexus-Endpoint': '${slug}' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  if (!res.ok) throw new Error(\`MCP HTTP \${res.status}\`);
  return res.json();
}`;

  const stdioCommandParts =
    parsed.transport === 'stdio'
      ? parsed.targetUrlOrCommand.trim().split(/\s+/)
      : ['npx', '-y', 'tsx', 'src/engines/mcp_stdio_bridge.ts', '--endpoint', slug];

  const stdioConfigJson = JSON.stringify(
    {
      mcpServers: {
        [slug]: {
          command: stdioCommandParts[0],
          args: stdioCommandParts.slice(1),
          transport: parsed.transport,
          timeoutMs: parsed.timeoutMs,
          env: {
            NEXUS_MCP_RPC_URL: 'http://localhost:3000/v1/mcp/rpc',
            NEXUS_AUTH_MODE: parsed.authMode,
          },
        },
      },
    },
    null,
    2
  );

  const record: McpEndpointRecord = {
    id: `mcp-ep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    name: parsed.name.trim(),
    transport: parsed.transport,
    targetUrlOrCommand: parsed.targetUrlOrCommand.trim(),
    authMode: parsed.authMode,
    timeoutMs: parsed.timeoutMs,
    maxRetries: parsed.maxRetries,
    status: 'active',
    httpxPythonCode,
    typescriptClientCode,
    stdioConfigJson,
    invocationsCount: 0,
    createdAt: new Date().toISOString(),
  };

  db.mcpEndpoints.unshift(record);
  recordAudit({
    kind: 'endpoint_generated',
    toolOrMethod: `endpoint:${record.transport}:${record.name}`,
    status: 'ok',
    latencyMs: Date.now() - startedAt,
    detail: `Vygenerován univerzální ${record.transport} endpoint (${record.targetUrlOrCommand})`,
  });

  return record;
}

export const HUB_MCP_TOOLS = [
  {
    name: 'multigen_create',
    description: 'All-in-One Multi-Generation Toolkit (image, video, movie, sketch, meme) s WAN-2.2 a LTX-2.5.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['image', 'video', 'movie', 'sketch', 'meme'] },
        modelId: { type: 'string', default: 'wan-2-2' },
        prompt: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['9:16', '16:9', '1:1'] },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'mcp_generate_endpoint',
    description: 'Vygeneruje univerzální adaptabilní httpx webhook nebo stdio MCP endpoint bez shell injekce.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        transport: { type: 'string', enum: ['httpx_webhook', 'stdio', 'streamable_http'] },
        targetUrlOrCommand: { type: 'string' },
        authMode: { type: 'string', enum: ['hmac_sha256', 'bearer', 'none'] },
      },
      required: ['name', 'targetUrlOrCommand'],
    },
  },
  {
    name: 'rag_search_knowledge',
    description: 'Prohledá lokální dlouhodobou paměť (RAG) včetně self-healing lekcí a agentních rozhodnutí.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 6 },
      },
      required: ['query'],
    },
  },
  {
    name: 'rag_store_lesson_learned',
    description: 'Uloží novou self-healing lekci nebo optimalizační pravidlo do lokální paměti agentů.',
    inputSchema: {
      type: 'object',
      properties: {
        lesson: { type: 'string' },
        importance: { type: 'number', default: 0.9 },
      },
      required: ['lesson'],
    },
  },
  {
    name: 'system_diagnostics',
    description: 'Vrátí stav binárek, event loopu, CPU, paměti, Media Vaultu a posledních self-healing oprav.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export const HUB_MCP_RESOURCES = [
  { uri: 'system://capabilities', name: 'System Capabilities & Models', mimeType: 'application/json' },
  { uri: 'logs://audit/latest', name: 'MCP & Self-Healing Audit Log', mimeType: 'application/json' },
  { uri: 'rag://collections', name: 'Local RAG & Memory Records', mimeType: 'application/json' },
  { uri: 'models://catalog', name: 'OpenGen & MultiGen Models (WAN-2.2, LTX-2.5)', mimeType: 'application/json' },
];

export const HUB_MCP_PROMPTS = [
  {
    name: 'chain_of_tools_campaign',
    description: 'Multi-step Chain-of-Tools workflow: RAG kontext -> MultiGen vizuál -> Video -> Revenue atribuce',
    arguments: [
      { name: 'topic', description: 'Téma kampaně', required: true },
      { name: 'modelId', description: 'ID modelu (wan-2-2 nebo ltx-2-5)', required: false },
    ],
  },
  {
    name: 'self_healing_audit_playbook',
    description: 'Diagnostický playbook pro kontrolu self-healing událostí a endpointů.',
    arguments: [{ name: 'scope', description: 'Rozsah kontroly', required: false }],
  },
];

export async function handleMcpJsonRpc(rpcRequest: {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, any>;
}) {
  const startedAt = Date.now();
  const id = rpcRequest?.id ?? null;
  const method = String(rpcRequest?.method || '').trim();
  const params = rpcRequest?.params || {};

  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-11-05',
          serverInfo: { name: 'nexus-godmode-titancore-mcp', version: '2.5.0' },
          capabilities: {
            tools: { listChanged: true },
            resources: { subscribe: false },
            prompts: {},
          },
        },
      };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: HUB_MCP_TOOLS },
      };
    }

    if (method === 'resources/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: { resources: HUB_MCP_RESOURCES },
      };
    }

    if (method === 'resources/read') {
      const uri = String(params.uri || '');
      let data: any = null;
      if (uri === 'system://capabilities') {
        data = {
          systemPaused: db.isSystemPaused,
          performance: db.getSystemPerformance(),
          toolsCount: HUB_MCP_TOOLS.length,
          endpointsCount: db.mcpEndpoints.length,
        };
      } else if (uri === 'logs://audit/latest') {
        data = { auditLogs: db.mcpAuditLogs.slice(0, 30), selfHealingEvents: db.selfHealingEvents.slice(0, 20) };
      } else if (uri === 'rag://collections') {
        data = { totalMemories: db.memories.length, latest: db.memories.slice(0, 15) };
      } else if (uri === 'models://catalog') {
        data = { models: db.openGenModels };
      } else {
        throw new Error(`Neznámý MCP resource URI: ${uri}`);
      }
      const norm = normalizeMcpOutput(data);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(norm.data, null, 2) }],
        },
      };
    }

    if (method === 'prompts/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: { prompts: HUB_MCP_PROMPTS },
      };
    }

    if (method === 'prompts/get') {
      const name = String(params.name || '');
      const promptSpec = HUB_MCP_PROMPTS.find((p) => p.name === name);
      if (!promptSpec) throw new Error(`Prompt "${name}" nenalezen.`);
      const topic = String(params.arguments?.topic || 'AI automatizace v roce 2026');
      const modelId = String(params.arguments?.modelId || 'wan-2-2');
      return {
        jsonrpc: '2.0',
        id,
        result: {
          description: promptSpec.description,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Proveď Chain-of-Tools pro "${topic}" s modelem ${modelId}: 1) rag_search_knowledge 2) multigen_create 3) system_diagnostics.`,
              },
            },
          ],
        },
      };
    }

    if (method === 'tools/call') {
      const toolName = String(params.name || '').trim();
      const args = (params.arguments || {}) as Record<string, any>;

      let rawResult: any;
      let status: McpAuditEntry['status'] = 'ok';

      if (toolName === 'multigen_create') {
        const res = await runMultiGenToolkit({
          type: args.type,
          modelId: args.modelId,
          prompt: args.prompt,
          aspectRatio: args.aspectRatio,
          durationSec: args.durationSec,
          dryRun: Boolean(args.dryRun),
        });
        if (res.healingEvents.length > 0) status = 'repaired';
        rawResult = res;
      } else if (toolName === 'mcp_generate_endpoint') {
        const ep = generateAdaptableMcpEndpoint({
          name: String(args.name || 'custom-webhook'),
          transport: args.transport || 'httpx_webhook',
          targetUrlOrCommand: String(args.targetUrlOrCommand || 'http://localhost:3000/v1/mcp/rpc'),
          authMode: args.authMode || 'hmac_sha256',
          timeoutMs: args.timeoutMs,
          maxRetries: args.maxRetries,
        });
        rawResult = ep;
      } else if (toolName === 'rag_search_knowledge') {
        const query = String(args.query || '');
        const limit = Number(args.limit || 6);
        rawResult = MemoryService.search(query, limit);
      } else if (toolName === 'rag_store_lesson_learned') {
        const lesson = String(args.lesson || '').trim();
        if (!lesson) throw new Error('Parametr lesson je povinný.');
        rawResult = MemoryService.save({
          kind: 'procedural',
          scope: 'business',
          content: lesson,
          importance: Number(args.importance || 0.9),
        });
      } else if (toolName === 'system_diagnostics') {
        rawResult = {
          performance: db.getSystemPerformance(),
          recentHealing: db.selfHealingEvents.slice(0, 5),
          endpointsActive: db.mcpEndpoints.length,
          mediaVaultVideos: db.factoryAssets.filter((a) => a.line === 'video').length,
        };
      } else {
        throw new Error(`Neznámý MCP tool "${toolName}".`);
      }

      const norm = normalizeMcpOutput(rawResult);
      recordAudit({
        kind: 'rpc_call',
        toolOrMethod: `tools/call:${toolName}`,
        status,
        latencyMs: Date.now() - startedAt,
        detail: norm.truncated ? 'Výsledek zkrácen na 8 000 znaků' : 'Úspěšně dokončeno',
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(norm.data, null, 2) }],
          structuredContent: norm.data,
          truncated: norm.truncated,
        },
      };
    }

    throw new Error(`Nepodporovaná MCP JSON-RPC metoda: "${method}"`);
  } catch (err: any) {
    const errMsg = err?.message || 'Neznámá chyba MCP Hubu';
    recordAudit({
      kind: 'rpc_call',
      toolOrMethod: method || 'unknown',
      status: 'error',
      latencyMs: Date.now() - startedAt,
      detail: errMsg,
    });
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: errMsg,
      },
    };
  }
}

export function getMediaRendererReferenceCheck(): boolean {
  return typeof MediaRenderer.getAssetFilePath === 'function';
}
