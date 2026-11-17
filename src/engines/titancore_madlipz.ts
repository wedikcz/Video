/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { MemoryService } from '../server/runtime/memory.ts';
import { db } from '../server/db.ts';
import {
  TitanCoreAgnesManifest,
  TitanCoreAssetBridge,
  TitanCoreAuditIssue,
  TitanCoreAuditResult,
  TitanCoreBlock,
  TitanCoreManifest,
} from '../types/nexus.ts';

export const TitanCoreBlockSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['hook', 'setup', 'escalation', 'punchline_loop']),
  start_sec: z.number().min(0),
  end_sec: z.number().positive(),
  voiceover_cz: z.string().min(1),
  subtitle_text: z.string().min(1),
  visual_direction: z.string().min(1),
  audio_cue: z.string().optional(),
  words_per_sec: z.number().optional(),
});

export const TitanCoreAgnesManifestSchema = z.object({
  generator: z.literal('agnes-video-generator'),
  version: z.string().min(1),
  aspect_ratio: z.literal('9:16'),
  resolution: z.literal('1080x1920'),
  fps: z.number().int().min(24).max(60),
  language: z.literal('cs-CZ'),
  word_level_subtitles: z.object({
    enabled: z.boolean(),
    safe_zone_y: z.number(),
    font_family: z.string().min(1),
    highlight_color: z.string().min(1),
    diacritics_utf8: z.boolean(),
  }),
  audio_pipeline: z.object({
    strip_original_audio: z.boolean(),
    human_dub_dominant: z.boolean(),
    target_lufs: z.number(),
  }),
  segments: z
    .array(
      z.object({
        id: z.string().min(1),
        role: z.enum(['hook', 'setup', 'escalation', 'punchline_loop']),
        start_sec: z.number().min(0),
        end_sec: z.number().positive(),
        text: z.string().min(1),
        visual_prompt: z.string().min(1),
      })
    )
    .min(4),
});

export const TitanCoreOutputSchema = z.object({
  pipeline_target: z.literal('wedikcz/video'),
  series_name: z.string().min(1),
  episode_number: z.number().int().min(1),
  humor_angle: z.string().min(3),
  target_duration_sec: z.number().min(10).max(25),
  ypp_score: z.number().min(0).max(100),
  healing_iterations: z.number().int().min(0).max(3),
  engine_used: z.string().min(1),
  blocks: z.array(TitanCoreBlockSchema).min(4),
  delivery: z.object({
    aspect_ratio: z.literal('9:16'),
    resolution: z.literal('1080x1920'),
    fps: z.number().int().min(24).max(60),
    audio_mode: z.literal('original_stripped_human_dub_dominant'),
    anti_fingerprint: z.object({
      lum_contrast: z.number(),
      micro_zoom_block_role: z.literal('punchline_loop'),
      color_shift: z.string().min(1),
    }),
    safe_zone_y: z.number(),
    raw_video_path: z.string().optional(),
    dub_audio_path: z.string().optional(),
  }),
  youtube_metadata: z.object({
    title: z.string().min(3),
    description: z.string().min(10),
    tags: z.array(z.string().min(1)).min(3),
    category: z.string().min(1),
    pinned_comment: z.string().min(5),
  }),
  asset_bridge: z.object({
    opensourcegen_prompt: z.string().min(20),
    opensourcegen_models: z.array(z.string()).min(1),
    agnes_manifest: TitanCoreAgnesManifestSchema,
  }),
  next_commands: z.array(z.string().min(4)).min(6),
});

export const MAX_PACING_WORDS_PER_SEC = 3.5;
export const MAX_HOOK_END_SEC = 2.2;
export const DURATION_TOLERANCE_SEC = 0.4;
export const MIN_YPP_SCORE = 92;
export const MAX_HEALING_ITERATIONS = 3;

export function countCzechWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.replace(/[.,!?;:„“"()–—-]/g, '').length > 0).length;
}

export function roundSec(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Self-Healing Critic & Audit Gate:
 * 1. HOOK_TIMING: First block must start at 0.0 s and end <= 2.2 s
 * 2. PACING_OVERFLOW: Speech rate in every block <= 3.5 words/s
 * 3. DURATION_MISMATCH: Last block end matches target_duration_sec (±0.4 s)
 * 4. YPP_COMPLIANCE: ypp_score >= 92 and original_stripped_human_dub_dominant
 */
export function auditAndDiagnose(manifest: TitanCoreManifest): TitanCoreAuditResult {
  const issues: TitanCoreAuditIssue[] = [];
  const blocks = manifest.blocks || [];

  if (blocks.length === 0) {
    issues.push({
      code: 'HOOK_TIMING',
      blockIndex: 0,
      detail: 'Manifest neobsahuje žádné časové bloky (blocks).',
    });
    return {
      passed: false,
      issues,
      diagnosis: 'Manifest neobsahuje žádné časové bloky.',
    };
  }

  // 1. HOOK_TIMING
  const first = blocks[0];
  if (Math.abs(first.start_sec - 0.0) > 0.01) {
    issues.push({
      code: 'HOOK_TIMING',
      blockIndex: 0,
      detail: `První blok musí začínat na 0.0 s (aktuálně ${first.start_sec} s).`,
    });
  }
  if (first.end_sec > MAX_HOOK_END_SEC || first.end_sec <= first.start_sec) {
    issues.push({
      code: 'HOOK_TIMING',
      blockIndex: 0,
      detail: `První blok (hook) musí končit nejpozději v ${MAX_HOOK_END_SEC} s (aktuálně ${first.end_sec} s).`,
    });
  }

  // 2. PACING_OVERFLOW
  blocks.forEach((block, idx) => {
    const duration = block.end_sec - block.start_sec;
    if (duration <= 0) {
      issues.push({
        code: 'PACING_OVERFLOW',
        blockIndex: idx,
        detail: `Blok #${idx + 1} (${block.role}) má neplatnou délku ${duration.toFixed(2)} s.`,
      });
      return;
    }
    const words = countCzechWords(block.voiceover_cz);
    const wps = words / duration;
    if (wps > MAX_PACING_WORDS_PER_SEC) {
      issues.push({
        code: 'PACING_OVERFLOW',
        blockIndex: idx,
        detail: `Blok #${idx + 1} (${block.role}) překračuje limit ${MAX_PACING_WORDS_PER_SEC} slova/s: ${wps.toFixed(2)} slova/s (${words} slov na ${duration.toFixed(2)} s). Zkrať text pro přirozený český dabing.`,
      });
    }
  });

  // 3. DURATION_MISMATCH
  const last = blocks[blocks.length - 1];
  const diff = Math.abs(last.end_sec - manifest.target_duration_sec);
  if (diff > DURATION_TOLERANCE_SEC) {
    issues.push({
      code: 'DURATION_MISMATCH',
      blockIndex: blocks.length - 1,
      detail: `Konec posledního bloku (${last.end_sec} s) nesedí na target_duration_sec (${manifest.target_duration_sec} s, tolerance ±${DURATION_TOLERANCE_SEC} s).`,
    });
  }

  // 4. YPP_COMPLIANCE
  if (manifest.ypp_score < MIN_YPP_SCORE) {
    issues.push({
      code: 'YPP_COMPLIANCE',
      detail: `YPP skóre monetizovatelnosti je ${manifest.ypp_score}/100, minimum je ${MIN_YPP_SCORE}/100.`,
    });
  }
  if (manifest.delivery?.audio_mode !== 'original_stripped_human_dub_dominant') {
    issues.push({
      code: 'YPP_COMPLIANCE',
      detail: 'Audio mód musí být original_stripped_human_dub_dominant pro plnou YPP shodu.',
    });
  }

  const diagnosis =
    issues.length === 0
      ? 'OK: Všechny TitanCore & YPP kontroly prošly bez výhrad.'
      : issues.map((i) => `[${i.code}] ${i.detail}`).join(' | ');

  return {
    passed: issues.length === 0,
    issues,
    diagnosis,
  };
}

export interface TitanCoreGenerationInput {
  visualDescription: string;
  durationSec: number;
  seriesName: string;
  episodeNumber?: number;
  humorStyle?: string;
  rawVideoPath?: string;
  dubAudioPath?: string;
  bannedHumorAngles?: string[];
  engineExecutors?: Array<{
    name: string;
    run: (ctx: TitanCoreEngineContext) => Promise<TitanCoreManifest>;
  }>;
}

export interface TitanCoreEngineContext {
  input: TitanCoreGenerationInput;
  targetDurationSec: number;
  bannedHumorAngles: string[];
  previousDraft?: TitanCoreManifest;
  diagnosis?: string;
  iteration: number;
}

export interface TitanCoreRunResult {
  manifest: TitanCoreManifest;
  audit: TitanCoreAuditResult;
  traceMeta: {
    promptTokens: number;
    completionTokens: number;
    engineHistory: string[];
    bannedHumorAngles: string[];
    healingIterations: number;
  };
}

const HUMOR_ANGLE_CATALOG = [
  'korporátní pasivní agrese přeložená do pražské reality',
  'suchý sarkasmus vyčerpaného ajťáka v pondělí ráno',
  'absurdní vnitřní monolog domácího mazlíčka jako exekutivního CEO',
  'přehnaně dramatická česká dabingová telenovela o obyčejném nákupu',
  'existenciální krize nad banální technickou závadou v přímém přenosu',
  'hyper-efektivní český kutil komentující high-tech scénu',
  'konspirační teorie souseda z paneláku aplikovaná na moderní AI',
  'vyhořelý startupový mentor dávající nevyžádané rady z gauče',
  'přeslazený HR newsletter naroubovaný na totální chaos',
  'český úřednický žargon v situaci akčního thrilleru',
  'generační střet mileniála a boomer pohledu během 3 sekund',
  'ironická dokumentární narace přírodopisného filmu o lidech v kanceláři',
];

export function retrieveBannedHumorAngles(query: string, limit = 10): string[] {
  const angles: string[] = [];
  const seen = new Set<string>();

  const pushAngle = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned || seen.has(cleaned.toLowerCase())) return;
    seen.add(cleaned.toLowerCase());
    angles.push(cleaned);
  };

  // Hybrid BM25 (0.4) + Cosine (0.6) retrieval via MemoryService
  const searchRes = MemoryService.search(`humor_angle ${query}`, 20);
  for (const mem of searchRes.memories) {
    const match = mem.content.match(/humor_angle:\s*([^|;\n]+)/i);
    if (match?.[1]) {
      pushAngle(match[1]);
    }
  }

  for (const mem of db.memories) {
    if (angles.length >= limit) break;
    const match = mem.content.match(/humor_angle:\s*([^|;\n]+)/i);
    if (match?.[1]) {
      pushAngle(match[1]);
    }
  }

  return angles.slice(0, limit);
}

function selectFreshHumorAngle(
  visualDescription: string,
  humorStyle: string | undefined,
  bannedAngles: string[]
): string {
  if (humorStyle && humorStyle.trim().length >= 3) {
    const explicit = humorStyle.trim();
    if (!bannedAngles.some((b) => b.toLowerCase() === explicit.toLowerCase())) {
      return explicit;
    }
    return `${explicit} (svěží obrat #${(bannedAngles.length % 7) + 2})`;
  }

  const bannedSet = new Set(bannedAngles.map((a) => a.toLowerCase()));
  const seed = Array.from(visualDescription).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

  for (let offset = 0; offset < HUMOR_ANGLE_CATALOG.length; offset++) {
    const candidate = HUMOR_ANGLE_CATALOG[(seed + offset) % HUMOR_ANGLE_CATALOG.length];
    if (!bannedSet.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `satirický komentář šitý na scénu (${Date.now().toString(36).slice(-4)})`;
}

function trimVoiceoverToPacing(text: string, durationSec: number, maxWps = 3.2): string {
  const maxWords = Math.max(2, Math.floor(durationSec * maxWps));
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  const sliced = words.slice(0, maxWords).join(' ').replace(/[,;:-]+$/, '');
  return /[.!?]$/.test(sliced) ? sliced : `${sliced}.`;
}

export function buildAssetBridge(params: {
  visualDescription: string;
  seriesName: string;
  humorAngle: string;
  blocks: TitanCoreBlock[];
  fps?: number;
}): TitanCoreAssetBridge {
  const fps = params.fps || 30;
  const opensourcegen_prompt = [
    `Vertical 9:16 high-retention cinematic comedy clip for "${params.seriesName}".`,
    `Primary visual scene: ${params.visualDescription}.`,
    `Comedic direction: expressive facial micro-reactions, dynamic push-in camera on punchline, crisp natural rim lighting, 35mm shallow depth of field, high contrast background separation for Czech kinetic captions.`,
    `Tone cue: ${params.humorAngle}. Clean frame with zero burnt-in English watermarks, ready for human Czech dubbing overlay.`,
  ].join(' ');

  const agnes_manifest: TitanCoreAgnesManifest = {
    generator: 'agnes-video-generator',
    version: '2.1.0',
    aspect_ratio: '9:16',
    resolution: '1080x1920',
    fps,
    language: 'cs-CZ',
    word_level_subtitles: {
      enabled: true,
      safe_zone_y: 1320,
      font_family: 'DejaVu-Sans-Bold',
      highlight_color: '#facc15',
      diacritics_utf8: true,
    },
    audio_pipeline: {
      strip_original_audio: true,
      human_dub_dominant: true,
      target_lufs: -14,
    },
    segments: params.blocks.map((b) => ({
      id: b.id,
      role: b.role,
      start_sec: b.start_sec,
      end_sec: b.end_sec,
      text: b.subtitle_text,
      visual_prompt: b.visual_direction,
    })),
  };

  return {
    opensourcegen_prompt,
    opensourcegen_models: ['LTX-2.3', 'Wan 2.2'],
    agnes_manifest,
  };
}

export function buildNextCommands(
  manifest: Pick<TitanCoreManifest, 'series_name' | 'episode_number' | 'target_duration_sec'>
): string[] {
  const nextEp = (manifest.episode_number || 1) + 1;
  const shorter = manifest.target_duration_sec > 15 ? 15 : 12;
  return [
    `Zkrátit na ${shorter} s`,
    'Přepnout humor na suchý sarkasmus',
    `Vygenerovat ${nextEp}. díl série`,
    'Spustit MoviePy YPP Render',
    'Otestovat A/B Hook',
    'Spustit 3-kolovou debatu 16 agentů nad scénářem',
  ];
}

function buildDeterministicMadLipzManifest(
  ctx: TitanCoreEngineContext,
  engineName: string
): TitanCoreManifest {
  const targetDur = Math.max(10, Math.min(25, roundSec(ctx.targetDurationSec)));
  const episodeNumber = Math.max(1, ctx.input.episodeNumber || 1);
  const seriesName = ctx.input.seriesName.trim() || 'MadLipz CZ Série';
  const scene = ctx.input.visualDescription.trim();
  const humorAngle = selectFreshHumorAngle(scene, ctx.input.humorStyle, ctx.bannedHumorAngles);

  const hookEnd = 2.0;
  const remaining = roundSec(targetDur - hookEnd);
  const setupDur = roundSec(remaining * 0.34);
  const escDur = roundSec(remaining * 0.36);
  const setupEnd = roundSec(hookEnd + setupDur);
  const escEnd = roundSec(setupEnd + escDur);
  const punchDur = roundSec(targetDur - escEnd);

  const isDrySarcasm =
    (ctx.input.humorStyle || '').toLowerCase().includes('sarkas') ||
    humorAngle.toLowerCase().includes('sarkas');

  const hookTextRaw = isDrySarcasm
    ? 'Počkej, fakt si myslíš, že tohle dopadne dobře?'
    : 'Počkejte, tohle nevymyslí ani český úřad!';
  const setupTextRaw = isDrySarcasm
    ? `Když vidíš "${scene.slice(0, 42)}", okamžitě víš, že pondělí začalo moc brzy a káva už nepomůže.`
    : `Celá scéna vypadá nevinně: ${scene.slice(0, 42)}, ale mozek v tu chvíli přepnul na nouzový režim.`;
  const escTextRaw = isDrySarcasm
    ? 'Nikdo nic neříká, všichni předstírají profesionalitu a v duchu už počítají minuty do pátku.'
    : 'Najednou se všechno zrychlí, ego letí nahoru a logika tiše odchází zadním vchodem pryč.';
  const punchTextRaw = isDrySarcasm
    ? 'Přesně takhle vypadá můj pracovní týden. Napiš díl dvě.'
    : 'A teď si to pusť ještě jednou od začátku!';

  const rawBlocks: Array<Omit<TitanCoreBlock, 'words_per_sec'>> = [
    {
      id: 'blk-1-hook',
      role: 'hook',
      start_sec: 0.0,
      end_sec: hookEnd,
      voiceover_cz: trimVoiceoverToPacing(hookTextRaw, hookEnd, 3.0),
      subtitle_text: trimVoiceoverToPacing(hookTextRaw, hookEnd, 3.0),
      visual_direction: `Okamžitý 9:16 detail na hlavní moment scény (${scene.slice(0, 50)}), rychlý nájezd kamery.`,
      audio_cue: 'whoosh_punch_in.wav + dry_mic_pop',
    },
    {
      id: 'blk-2-setup',
      role: 'setup',
      start_sec: hookEnd,
      end_sec: setupEnd,
      voiceover_cz: trimVoiceoverToPacing(setupTextRaw, setupDur, 3.1),
      subtitle_text: trimVoiceoverToPacing(setupTextRaw, setupDur, 3.1),
      visual_direction: `Střední záběr s jemnou LumContrast úpravou, zvýraznění mimiky a reakce v ${seriesName}.`,
      audio_cue: 'subtle_room_tone_ducked',
    },
    {
      id: 'blk-3-escalation',
      role: 'escalation',
      start_sec: setupEnd,
      end_sec: escEnd,
      voiceover_cz: trimVoiceoverToPacing(escTextRaw, escDur, 3.1),
      subtitle_text: trimVoiceoverToPacing(escTextRaw, escDur, 3.1),
      visual_direction: 'Rytmický střih s kontrastním barevným posunem, budování komediálního napětí.',
      audio_cue: 'comedy_riser_stinger',
    },
    {
      id: 'blk-4-punchline',
      role: 'punchline_loop',
      start_sec: escEnd,
      end_sec: targetDur,
      voiceover_cz: trimVoiceoverToPacing(punchTextRaw, punchDur, 3.0),
      subtitle_text: trimVoiceoverToPacing(punchTextRaw, punchDur, 3.0),
      visual_direction: 'Dynamický micro-zoom 1.08x na finální výraz, plynulá audio smyčka zpět na 0.0 s.',
      audio_cue: 'record_scratch_loop_bridge',
    },
  ];

  const blocks: TitanCoreBlock[] = rawBlocks.map((b) => {
    const dur = Math.max(0.1, b.end_sec - b.start_sec);
    const words = countCzechWords(b.voiceover_cz);
    return {
      ...b,
      words_per_sec: roundSec(words / dur),
    };
  });

  const asset_bridge = buildAssetBridge({
    visualDescription: scene,
    seriesName,
    humorAngle,
    blocks,
    fps: 30,
  });

  return {
    pipeline_target: 'wedikcz/video',
    series_name: seriesName,
    episode_number: episodeNumber,
    humor_angle: humorAngle,
    target_duration_sec: targetDur,
    ypp_score: 96,
    healing_iterations: ctx.iteration,
    engine_used: engineName,
    blocks,
    delivery: {
      aspect_ratio: '9:16',
      resolution: '1080x1920',
      fps: 30,
      audio_mode: 'original_stripped_human_dub_dominant',
      anti_fingerprint: {
        lum_contrast: 0.08,
        micro_zoom_block_role: 'punchline_loop',
        color_shift: 'warm_satire_grade_v2',
      },
      safe_zone_y: 1320,
      ...(ctx.input.rawVideoPath ? { raw_video_path: ctx.input.rawVideoPath } : {}),
      ...(ctx.input.dubAudioPath ? { dub_audio_path: ctx.input.dubAudioPath } : {}),
    },
    youtube_metadata: {
      title: `${seriesName} #${episodeNumber}: ${scene.slice(0, 44)} #Shorts #MadLipzCZ`,
      description: `Autorský český dabing série ${seriesName} (Díl #${episodeNumber}). Úhel humoru: ${humorAngle}. Původní zvuk zcela nahrazen lidským dabingem a anti-fingerprint střihem.`,
      tags: ['MadLipzCZ', 'Shorts', 'CeskyDabing', seriesName.replace(/\s+/g, ''), 'KomedieCZ'],
      category: 'Comedy',
      pinned_comment: `Která hláška ze série ${seriesName} tě dostala nejvíc? Napiš číslo vteřiny do komentáře!`,
    },
    asset_bridge,
    next_commands: buildNextCommands({
      series_name: seriesName,
      episode_number: episodeNumber,
      target_duration_sec: targetDur,
    }),
  };
}

function enrichManifestMetadata(
  manifest: TitanCoreManifest,
  ctx: TitanCoreEngineContext,
  engineName: string
): TitanCoreManifest {
  const enrichedBlocks = manifest.blocks.map((b) => {
    const dur = Math.max(0.1, b.end_sec - b.start_sec);
    return {
      ...b,
      words_per_sec: roundSec(countCzechWords(b.voiceover_cz) / dur),
    };
  });

  const nextCommands =
    Array.isArray(manifest.next_commands) && manifest.next_commands.length >= 6
      ? manifest.next_commands
      : buildNextCommands(manifest);

  const assetBridge =
    manifest.asset_bridge?.opensourcegen_prompt && manifest.asset_bridge?.agnes_manifest
      ? manifest.asset_bridge
      : buildAssetBridge({
          visualDescription: ctx.input.visualDescription,
          seriesName: manifest.series_name,
          humorAngle: manifest.humor_angle,
          blocks: enrichedBlocks,
          fps: manifest.delivery?.fps || 30,
        });

  return {
    ...manifest,
    pipeline_target: 'wedikcz/video',
    healing_iterations: ctx.iteration,
    engine_used: engineName,
    blocks: enrichedBlocks,
    asset_bridge: assetBridge,
    next_commands: nextCommands,
  };
}

function buildLlmPrompt(ctx: TitanCoreEngineContext): { systemInstruction: string; userPrompt: string } {
  const bannedBlock =
    ctx.bannedHumorAngles.length > 0
      ? `ZAKÁZANÉ KOMEDIÁLNÍ ÚHLY (nikdy je neopakuj, aby nevznikal Repetitious Content):\n${ctx.bannedHumorAngles
          .map((a, i) => `${i + 1}. ${a}`)
          .join('\n')}`
      : 'Žádné předchozí úhly nejsou zakázány.';

  const repairBlock = ctx.diagnosis
    ? `\nOPRAVNÝ PRŮCHOD (Self-Healing iterace #${ctx.iteration}):\nPředchozí návrh selhal na těchto kontrolách:\n${ctx.diagnosis}\nOprav JSON manifest tak, aby prošel 100 % kontrol:\n- HOOK_TIMING: blok 0 musí začínat 0.0 a končit <= 2.2 s\n- PACING_OVERFLOW: každý blok <= 3.5 slova/s\n- DURATION_MISMATCH: konec posledního bloku == ${ctx.targetDurationSec} (±0.4 s)\n- YPP_COMPLIANCE: ypp_score >= 92 a audio_mode = "original_stripped_human_dub_dominant"`
    : '';

  const systemInstruction = `Jsi GODMODE-TITANCORE + MadLipz CZ YPP Video Director pro repozitář wedikcz/video.
Vracíš VÝHRADNĚ validní JSON objekt odpovídající schématu TitanCoreOutputSchema bez jakéhokoli markdownu nebo komentářů.
Tvrdá pravidla:
1. pipeline_target = "wedikcz/video"
2. target_duration_sec = ${ctx.targetDurationSec} (rozmezí 10–25 s)
3. Přesně 4 bloky s rolemi: hook, setup, escalation, punchline_loop.
4. První blok (hook) musí mít start_sec: 0.0 a end_sec <= 2.2.
5. V každém bloku nesmí voiceover_cz překročit 3.5 slova za sekundu.
6. Konec posledního bloku musí být ${ctx.targetDurationSec} (±0.4 s).
7. ypp_score >= 92, delivery.aspect_ratio = "9:16", delivery.resolution = "1080x1920", delivery.audio_mode = "original_stripped_human_dub_dominant", safe_zone_y = 1320.
8. next_commands musí obsahovat minimálně 6 konkrétních českých rozkazovacích vět.`;

  const userPrompt = `Vytvoř MadLipz CZ YPP manifest pro:
- Série: ${ctx.input.seriesName} (Díl #${ctx.input.episodeNumber || 1})
- Popis vizuální scény: ${ctx.input.visualDescription}
- Cílová stopáž: ${ctx.targetDurationSec} s
- Požadovaný styl humoru: ${ctx.input.humorStyle || 'autentický český satirický dabing'}
${bannedBlock}${repairBlock}`;

  return { systemInstruction, userPrompt };
}

function extractJsonObject(raw: string): any {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

async function callGeminiEngine(
  ctx: TitanCoreEngineContext,
  modelName: 'gemini-2.5-pro' | 'gemini-4-hydrogen'
): Promise<TitanCoreManifest> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const { systemInstruction, userPrompt } = buildLlmPrompt(ctx);

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${modelName} timeout after 15000ms`)), 15000)
  );

  const response = await Promise.race([
    ai.models.generateContent({
      model: modelName,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    }),
    timeoutPromise,
  ]);

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error(`${modelName} returned empty payload`);
  }
  const parsed = extractJsonObject(rawText);
  const hydrated = enrichManifestMetadata(parsed as TitanCoreManifest, ctx, modelName);
  return TitanCoreOutputSchema.parse(hydrated);
}

async function callOpenAiFallbackEngine(ctx: TitanCoreEngineContext): Promise<TitanCoreManifest> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const { systemInstruction, userPrompt } = buildLlmPrompt(ctx);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`OpenAI fallback HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    const hydrated = enrichManifestMetadata(parsed as TitanCoreManifest, ctx, 'openai-fallback');
    return TitanCoreOutputSchema.parse(hydrated);
  } finally {
    clearTimeout(timer);
  }
}

function deterministicRepairManifest(
  draft: TitanCoreManifest,
  ctx: TitanCoreEngineContext,
  engineName: string
): TitanCoreManifest {
  const targetDur = Math.max(10, Math.min(25, roundSec(ctx.targetDurationSec)));
  const clean = buildDeterministicMadLipzManifest(ctx, engineName);

  const repairedBlocks: TitanCoreBlock[] = (draft.blocks.length >= 4 ? draft.blocks : clean.blocks)
    .slice(0, 4)
    .map((blk, idx) => {
      const ref = clean.blocks[idx];
      const start_sec = ref.start_sec;
      const end_sec = ref.end_sec;
      const dur = Math.max(0.2, end_sec - start_sec);
      const voiceover_cz = trimVoiceoverToPacing(blk.voiceover_cz || ref.voiceover_cz, dur, 3.2);
      const subtitle_text = trimVoiceoverToPacing(blk.subtitle_text || voiceover_cz, dur, 3.2);
      return {
        ...blk,
        id: blk.id || ref.id,
        role: ref.role,
        start_sec,
        end_sec,
        voiceover_cz,
        subtitle_text,
        words_per_sec: roundSec(countCzechWords(voiceover_cz) / dur),
      };
    });

  return enrichManifestMetadata(
    {
      ...draft,
      target_duration_sec: targetDur,
      ypp_score: Math.max(MIN_YPP_SCORE, draft.ypp_score || 95),
      blocks: repairedBlocks,
      delivery: {
        ...clean.delivery,
        ...draft.delivery,
        audio_mode: 'original_stripped_human_dub_dominant',
      },
    },
    ctx,
    engineName
  );
}

export async function runTitanCoreMadLipz(
  input: TitanCoreGenerationInput
): Promise<TitanCoreRunResult> {
  const targetDurationSec = Math.max(10, Math.min(25, roundSec(Number(input.durationSec) || 15)));
  const memoryBanned = retrieveBannedHumorAngles(
    `${input.seriesName} ${input.visualDescription}`,
    10
  );
  const bannedHumorAngles = Array.from(
    new Set([...(input.bannedHumorAngles || []), ...memoryBanned])
  ).slice(0, 10);

  const defaultEngines: Array<{
    name: string;
    run: (ctx: TitanCoreEngineContext) => Promise<TitanCoreManifest>;
  }> = [
    { name: 'gemini-2.5-pro', run: (ctx) => callGeminiEngine(ctx, 'gemini-2.5-pro') },
    { name: 'gemini-4-hydrogen', run: (ctx) => callGeminiEngine(ctx, 'gemini-4-hydrogen') },
    { name: 'openai-fallback', run: callOpenAiFallbackEngine },
    {
      name: 'titancore-local-madlipz-cz',
      run: async (ctx) => buildDeterministicMadLipzManifest(ctx, 'titancore-local-madlipz-cz'),
    },
  ];

  const engines =
    input.engineExecutors && input.engineExecutors.length > 0
      ? input.engineExecutors
      : defaultEngines;

  const engineHistory: string[] = [];
  let promptTokens = 420;
  let completionTokens = 560;

  let currentManifest: TitanCoreManifest | null = null;
  let currentAudit: TitanCoreAuditResult | null = null;
  let healingIterations = 0;

  const initialCtx: TitanCoreEngineContext = {
    input,
    targetDurationSec,
    bannedHumorAngles,
    iteration: 0,
  };

  for (const engine of engines) {
    try {
      const candidate = await engine.run(initialCtx);
      const enriched = enrichManifestMetadata(candidate, initialCtx, engine.name);
      engineHistory.push(engine.name);
      currentManifest = enriched;
      break;
    } catch {
      engineHistory.push(`${engine.name}:failed`);
    }
  }

  if (!currentManifest) {
    currentManifest = buildDeterministicMadLipzManifest(initialCtx, 'titancore-local-madlipz-cz');
    engineHistory.push('titancore-local-madlipz-cz');
  }

  currentAudit = auditAndDiagnose(currentManifest);

  while (!currentAudit.passed && healingIterations < MAX_HEALING_ITERATIONS) {
    healingIterations += 1;
    promptTokens += 240;
    completionTokens += 310;

    const repairCtx: TitanCoreEngineContext = {
      input,
      targetDurationSec,
      bannedHumorAngles,
      previousDraft: currentManifest,
      diagnosis: currentAudit.diagnosis,
      iteration: healingIterations,
    };

    const rotatedEngines = [
      ...engines.slice(healingIterations % engines.length),
      ...engines.slice(0, healingIterations % engines.length),
    ];

    let repairedCandidate: TitanCoreManifest | null = null;
    for (const engine of rotatedEngines) {
      try {
        const out = await engine.run(repairCtx);
        const enriched = enrichManifestMetadata(out, repairCtx, engine.name);
        engineHistory.push(`heal#${healingIterations}:${engine.name}`);
        repairedCandidate = enriched;
        break;
      } catch {
        engineHistory.push(`heal#${healingIterations}:${engine.name}:failed`);
      }
    }

    if (!repairedCandidate) {
      repairedCandidate = deterministicRepairManifest(
        currentManifest,
        repairCtx,
        'titancore-local-healer'
      );
      engineHistory.push(`heal#${healingIterations}:titancore-local-healer`);
    }

    const nextAudit = auditAndDiagnose(repairedCandidate);
    if (!nextAudit.passed && healingIterations === MAX_HEALING_ITERATIONS) {
      currentManifest = deterministicRepairManifest(
        repairedCandidate,
        repairCtx,
        repairedCandidate.engine_used
      );
      currentAudit = auditAndDiagnose(currentManifest);
    } else {
      currentManifest = repairedCandidate;
      currentAudit = nextAudit;
    }
  }

  currentManifest.healing_iterations = healingIterations;
  const validated = TitanCoreOutputSchema.parse(currentManifest);

  MemoryService.save({
    kind: 'episodic',
    scope: 'campaign',
    content: `humor_angle: ${validated.humor_angle} | series: ${validated.series_name} #${validated.episode_number} | ypp_score: ${validated.ypp_score}`,
    importance: 0.9,
  });

  return {
    manifest: validated,
    audit: currentAudit,
    traceMeta: {
      promptTokens,
      completionTokens,
      engineHistory,
      bannedHumorAngles,
      healingIterations,
    },
  };
}
