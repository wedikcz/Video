/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

process.env.NEXUS_SKIP_LISTEN = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import {
  addBatchQueueItem,
  clearFinishedBatchItems,
  computeBatchQueueSummary,
  createBatchQueueItem,
  getNextPendingBatchItem,
  moveBatchQueueItem,
  removeBatchQueueItem,
  retryBatchQueueItem,
  updateBatchQueueItem,
} from '../src/utils/batchVideoQueue.ts';
import {
  buildAiEnhanceSystemInstruction,
  buildAiEnhanceUserPrompt,
  mergeAiEnhancedStructure,
  resolveSelectedStyleTag,
} from '../src/utils/aiSmartEnhance.ts';
import { parseStructuredPromptFromText } from '../src/utils/structuredVideoPrompt.ts';
import {
  VISUAL_DRAG_TAGS,
  applyVisualTagToPrompt,
} from '../src/utils/monetizationCheatsheets.ts';
import {
  AiPromptEnhanceError,
  enhanceStructuredPromptWithGemini,
} from '../src/server/runtime/aiPromptEnhancer.ts';
import { app } from '../server.ts';

test('BatchVideoQueue: creates independent tasks with distinct prompts/parameters and manages sequential order', () => {
  const sourcePrompt = parseStructuredPromptFromText('První dronový průlet Prahou');
  const task1 = createBatchQueueItem({
    id: 'task-1',
    prompt: 'První dronový průlet Prahou v neonovém dešti',
    modelId: 'nexus-local-director',
    modelName: 'Lokální Chytrý Režisér (Bez API)',
    creditCost: 0,
    format: '9:16',
    fps: 30,
    qualityTier: '1080p',
    cameraMotion: 'fpv_drone',
    motionIntensity: 9,
    visualStyle: 'cyberpunk_neon',
    durationSec: 6,
    structuredPrompt: sourcePrompt,
  });

  // Ensure mutating original prompt does not mutate queued item
  sourcePrompt.subject.primarySubject = 'MUTATED_SUBJECT';
  assert.notEqual(task1.structuredPrompt.subject.primarySubject, 'MUTATED_SUBJECT');

  const task2 = createBatchQueueItem({
    id: 'task-2',
    prompt: 'Luxusní makro detail hodinek na mramoru',
    modelId: 'veo-3-1',
    modelName: 'Google Veo 3.1',
    creditCost: 12,
    format: '16:9',
    fps: 60,
    qualityTier: '4K',
    cameraMotion: 'orbit_360',
    motionIntensity: 5,
    visualStyle: 'luxury_gold',
    durationSec: 8,
  });

  assert.equal(task1.status, 'queued');
  assert.equal(task2.format, '16:9');
  assert.equal(task2.fps, 60);
  assert.equal(task2.qualityTier, '4K');
  assert.equal(task2.cameraMotion, 'orbit_360');
  assert.equal(task2.visualStyle, 'luxury_gold');

  let queue = addBatchQueueItem([], task1);
  queue = addBatchQueueItem(queue, task2);
  assert.equal(queue.length, 2);

  // Move task-2 up before task-1
  queue = moveBatchQueueItem(queue, 'task-2', 'up');
  assert.equal(queue[0].id, 'task-2');
  assert.equal(queue[1].id, 'task-1');

  // Next pending item should be task-2 now
  assert.equal(getNextPendingBatchItem(queue)?.id, 'task-2');

  // Mark task-2 as running; cannot remove or reorder running task
  queue = updateBatchQueueItem(queue, 'task-2', {
    status: 'running',
    progressPercent: 50,
  });
  queue = removeBatchQueueItem(queue, 'task-2');
  assert.equal(queue.length, 2);
  queue = moveBatchQueueItem(queue, 'task-1', 'up');
  assert.equal(queue[0].id, 'task-2');

  // Mark task-2 completed and task-1 failed, check summary & retry
  queue = updateBatchQueueItem(queue, 'task-2', { status: 'completed', progressPercent: 100 });
  queue = updateBatchQueueItem(queue, 'task-1', { status: 'failed', error: 'Simulovaná chyba' });

  const summary = computeBatchQueueSummary(queue);
  assert.equal(summary.total, 2);
  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.overallProgressPercent, 100);

  queue = retryBatchQueueItem(queue, 'task-1');
  assert.equal(queue[1].status, 'queued');
  assert.equal(queue[1].error, undefined);

  queue = clearFinishedBatchItems(queue);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, 'task-1');
});

test('AiSmartEnhance: swaps style tags cleanly, resolves active style tag, and merges AI payload into 4 pillars', () => {
  const base = parseStructuredPromptFromText('Rychlý robotický barman míchá drink');
  const cyberpunkTag = VISUAL_DRAG_TAGS.find((t) => t.id === 'style-cyberpunk');
  const luxuryTag = VISUAL_DRAG_TAGS.find((t) => t.id === 'style-luxury');
  assert.ok(cyberpunkTag && luxuryTag);

  const step1 = applyVisualTagToPrompt(base, cyberpunkTag);
  assert.ok(step1.structuredPrompt.activeTagIds?.includes('style-cyberpunk'));

  // Selecting another style tag swaps out previous style-* tag so style selection is unambiguous
  const step2 = applyVisualTagToPrompt(step1.structuredPrompt, luxuryTag);
  assert.ok(step2.structuredPrompt.activeTagIds?.includes('style-luxury'));
  assert.ok(!step2.structuredPrompt.activeTagIds?.includes('style-cyberpunk'));

  const resolved = resolveSelectedStyleTag(step2.structuredPrompt);
  assert.equal(resolved.tagId, 'style-luxury');
  assert.equal(resolved.styleKey, 'luxury_gold');

  const sysPrompt = buildAiEnhanceSystemInstruction(resolved);
  const userPrompt = buildAiEnhanceUserPrompt('Barman míchá zlatý drink', step2.structuredPrompt, resolved);
  assert.ok(sysPrompt.includes(resolved.tagLabel));
  assert.ok(userPrompt.includes('Barman míchá zlatý drink'));

  const merged = mergeAiEnhancedStructure(
    step2.structuredPrompt,
    {
      expandedRawPrompt:
        'Filmový makro záběr na křišťálovou sklenici se zlatým koktejlem na leštěném mramoru, teplé anamorfní odlesky 85mm objektivu.',
      primarySubject: 'Křišťálový koktejl a robotická ruka barmana',
      subjectAction: 'Precizní nalévání zlatého nektaru přes kostku ledu',
      environment: 'Soukromý luxusní lounge bar s černým mramorem a zlatou mosazí',
      composition: 'macro_detail',
      lighting: 'golden_hour',
      optics: '85mm_portrait',
      atmosphere: 'volumetric_dust',
      cameraMotion: 'orbit_360',
      motionIntensity: 6,
      cinematicNotes: ['Zlaté odlesky na skle', 'Kontrolovaný 360° orbit'],
      beats: [
        {
          phase: 'opening_hook',
          beatTitle: 'ZLATÝ HOOK',
          sceneDescription: 'Makro detail kapky dopadající na led v protisvětle.',
          cameraKeyframe: 'zoom_in',
          transitionIn: 'zoom_punch',
          kineticCaption: 'TEKUTÉ ZLATO',
        },
        {
          phase: 'development',
          beatTitle: 'ORBIT',
          sceneDescription: 'Plynulý oblet kolem sklenice s bokeh pozadím.',
          cameraKeyframe: 'orbit_360',
          transitionIn: 'crossfade',
          kineticCaption: 'PRECIZNÍ ŘEMESLO',
        },
        {
          phase: 'closing_loop',
          beatTitle: 'FINÁLE',
          sceneDescription: 'Odstup kamery do širokého pohledu na barový pult.',
          cameraKeyframe: 'zoom_out',
          transitionIn: 'whip_pan',
          kineticCaption: 'LUXUSNÍ SERVIS',
        },
      ],
    },
    resolved
  );

  assert.equal(merged.structuredPrompt.style.visualStyle, 'luxury_gold');
  assert.equal(merged.structuredPrompt.subject.composition, 'macro_detail');
  assert.equal(merged.structuredPrompt.temporal.beats.length, 3);
  const totalBeatDur = merged.structuredPrompt.temporal.beats.reduce(
    (sum, b) => sum + b.durationSec,
    0
  );
  assert.ok(Math.abs(totalBeatDur - merged.structuredPrompt.totalDurationSec) < 0.2);
  assert.equal(merged.cinematicNotes.length, 2);
});

test('AiPromptEnhancer & API endpoint: reports explicit 503 error without GEMINI_API_KEY and expands via Gemini handler when key/output present', async () => {
  // 1. Missing prompt throws 400
  await assert.rejects(
    () =>
      enhanceStructuredPromptWithGemini({
        rawPrompt: '   ',
        apiKeyOverride: 'test-key',
      }),
    (err: any) => err instanceof AiPromptEnhanceError && err.statusCode === 400
  );

  // 2. Missing/placeholder GEMINI_API_KEY returns honest 503 (no fake AI fallback)
  await assert.rejects(
    () =>
      enhanceStructuredPromptWithGemini({
        rawPrompt: 'Kyberpunkový běžec v dešti',
        apiKeyOverride: '',
      }),
    (err: any) => err instanceof AiPromptEnhanceError && err.statusCode === 503
  );

  // 3. Valid Gemini JSON output is parsed, validated, and merged according to selected style tag
  const result = await enhanceStructuredPromptWithGemini({
    rawPrompt: 'Kyberpunkový běžec v dešti',
    selectedStyleTagId: 'style-cyberpunk',
    generateContentOverride: async ({ model, systemInstruction, contents }) => {
      assert.equal(model, 'gemini-4-hydrogen');
      assert.ok(systemInstruction.includes('Cyberpunk Neon'));
      assert.ok(contents.includes('Kyberpunkový běžec v dešti'));
      return JSON.stringify({
        expandedRawPrompt:
          'Noční neonový sprint kybernetického běžce deštivou ulicí Neo-Prahy s odrazy tyrkysových hologramů v kalužích.',
        primarySubject: 'Kybernetický běžec v holografické bundě',
        subjectAction: 'Agresivní sprint s odletující vodní tříští',
        environment: 'Mokrá betonová třída plná neonových nápisů a páry',
        composition: 'wide_establishing',
        lighting: 'volumetric_neon',
        optics: '35mm_anamorphic',
        atmosphere: 'rain_particles',
        cameraMotion: 'fpv_drone',
        motionIntensity: 9,
        cinematicNotes: ['Tyrkysovo-purpurové odrazy', 'Agilní FPV pronásledování'],
        beats: [
          {
            phase: 'opening_hook',
            beatTitle: 'NEON NÁRAZ',
            sceneDescription: 'Nízký nájezd nad mokrým asfaltem k běžci.',
            cameraKeyframe: 'fpv_drone',
            transitionIn: 'glitch_flash',
            kineticCaption: 'ÚNIK V DEŠTI',
          },
          {
            phase: 'climax_reveal',
            beatTitle: 'ROZŠÍŘENÍ',
            sceneDescription: 'Kamera obkrouží běžce při skoku přes kaluž.',
            cameraKeyframe: 'orbit_360',
            transitionIn: 'whip_pan',
            kineticCaption: 'RYCHLOST SVĚTLA',
          },
          {
            phase: 'closing_loop',
            beatTitle: 'MIZENÍ',
            sceneDescription: 'Běžec mizí v neonové mlze velkoměsta.',
            cameraKeyframe: 'zoom_out',
            transitionIn: 'crossfade',
            kineticCaption: 'DALŠÍ ÚROVEŇ',
          },
        ],
      });
    },
  });

  assert.equal(result.engine, 'gemini-4-hydrogen');
  assert.equal(result.structuredPrompt.style.visualStyle, 'cyberpunk_neon');
  assert.equal(result.structuredPrompt.camera.primaryMotion, 'fpv_drone');
  assert.equal(result.structuredPrompt.temporal.beats.length, 3);
  assert.ok(result.score.overall >= 70);

  // 4. HTTP route returns honest 503 JSON when GEMINI_API_KEY is absent/placeholder
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '';
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/video/structured-prompt/ai-enhance`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawPrompt: 'Kyberpunkový běžec v dešti',
          selectedStyleTagId: 'style-cyberpunk',
        }),
      }
    );
    const data = await res.json();
    assert.equal(res.status, 503);
    assert.ok(typeof data.error === 'string' && data.error.includes('GEMINI_API_KEY'));
  } finally {
    process.env.GEMINI_API_KEY = originalKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
