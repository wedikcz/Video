/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

process.env.NEXUS_SKIP_LISTEN = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AddressInfo } from 'node:net';
import {
  auditAndDiagnose,
  buildAssetBridge,
  buildNextCommands,
  retrieveBannedHumorAngles,
  runTitanCoreMadLipz,
} from '../src/engines/titancore_madlipz.ts';
import { TitanCoreManifest } from '../src/types/nexus.ts';
import { app } from '../server.ts';

function makeValidBaseManifest(overrides?: Partial<TitanCoreManifest>): TitanCoreManifest {
  const blocks: TitanCoreManifest['blocks'] = [
    {
      id: 'blk-1-hook',
      role: 'hook',
      start_sec: 0.0,
      end_sec: 2.0,
      voiceover_cz: 'Počkejte, tohle není normální!',
      subtitle_text: 'Počkejte, tohle není normální!',
      visual_direction: 'Detail na obličej v 9:16',
      words_per_sec: 2.0,
    },
    {
      id: 'blk-2-setup',
      role: 'setup',
      start_sec: 2.0,
      end_sec: 6.5,
      voiceover_cz: 'Každé pondělí v kanceláři začíná stejně.',
      subtitle_text: 'Každé pondělí v kanceláři začíná stejně.',
      visual_direction: 'Střední záběr na poradu',
      words_per_sec: 1.33,
    },
    {
      id: 'blk-3-escalation',
      role: 'escalation',
      start_sec: 6.5,
      end_sec: 11.0,
      voiceover_cz: 'Šéf otevře prázdnou tabulku a tváří se vážně.',
      subtitle_text: 'Šéf otevře prázdnou tabulku a tváří se vážně.',
      visual_direction: 'Rytmický střih na kolegy',
      words_per_sec: 1.78,
    },
    {
      id: 'blk-4-punchline',
      role: 'punchline_loop',
      start_sec: 11.0,
      end_sec: 15.0,
      voiceover_cz: 'A přesně proto piju třetí kafe.',
      subtitle_text: 'A přesně proto piju třetí kafe.',
      visual_direction: 'Micro-zoom na výraz',
      words_per_sec: 1.5,
    },
  ];

  return {
    pipeline_target: 'wedikcz/video',
    series_name: 'Kancelář CZ',
    episode_number: 1,
    humor_angle: 'suchý sarkasmus vyčerpaného ajťáka v pondělí ráno',
    target_duration_sec: 15,
    ypp_score: 96,
    healing_iterations: 0,
    engine_used: 'test-engine',
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
    },
    youtube_metadata: {
      title: 'Kancelář CZ #1: Pondělní porada #Shorts',
      description: 'Český satirický dabing s plně nahrazeným zvukem.',
      tags: ['MadLipzCZ', 'Shorts', 'CeskyDabing'],
      category: 'Comedy',
      pinned_comment: 'Která vteřina je nejlepší?',
    },
    asset_bridge: buildAssetBridge({
      visualDescription: 'Pondělní porada v kanceláři',
      seriesName: 'Kancelář CZ',
      humorAngle: 'suchý sarkasmus',
      blocks,
    }),
    next_commands: buildNextCommands({
      series_name: 'Kancelář CZ',
      episode_number: 1,
      target_duration_sec: 15,
    }),
    ...overrides,
  };
}

test('TitanCore Test 1: auditAndDiagnose detects PACING_OVERFLOW (>3.5 words/s) and HOOK_TIMING error', () => {
  const defective = makeValidBaseManifest();
  defective.blocks[0] = {
    ...defective.blocks[0],
    start_sec: 0.4,
    end_sec: 2.9,
  };
  defective.blocks[1] = {
    ...defective.blocks[1],
    start_sec: 2.9,
    end_sec: 4.9,
    voiceover_cz: 'Jeden dva tři čtyři pět šest sedm osm devět deset jedenáct dvanáct slov',
  };

  const audit = auditAndDiagnose(defective);
  assert.equal(audit.passed, false);

  const codes = new Set(audit.issues.map((i) => i.code));
  assert.ok(codes.has('HOOK_TIMING'), 'Expected HOOK_TIMING issue to be diagnosed');
  assert.ok(codes.has('PACING_OVERFLOW'), 'Expected PACING_OVERFLOW issue to be diagnosed');
  assert.ok(audit.diagnosis.includes('HOOK_TIMING'));
  assert.ok(audit.diagnosis.includes('PACING_OVERFLOW'));
});

test('TitanCore Test 2: runTitanCoreMadLipz performs Self-Healing from defective Engine 1 to compliant Engine 2 (healing_iterations: 1)', async () => {
  const defectiveDraft = makeValidBaseManifest({
    ypp_score: 85,
    blocks: [
      {
        id: 'blk-1-hook',
        role: 'hook',
        start_sec: 0.5,
        end_sec: 3.1,
        voiceover_cz: 'Příliš dlouhý úvodní text který má moc slov na rychlý český dabing v prvních sekundách videa.',
        subtitle_text: 'Příliš dlouhý úvodní text',
        visual_direction: 'Záběr',
      },
      {
        id: 'blk-2-setup',
        role: 'setup',
        start_sec: 3.1,
        end_sec: 7.0,
        voiceover_cz: 'Druhý blok v pořádku.',
        subtitle_text: 'Druhý blok v pořádku.',
        visual_direction: 'Záběr',
      },
      {
        id: 'blk-3-escalation',
        role: 'escalation',
        start_sec: 7.0,
        end_sec: 11.0,
        voiceover_cz: 'Třetí blok graduje.',
        subtitle_text: 'Třetí blok graduje.',
        visual_direction: 'Záběr',
      },
      {
        id: 'blk-4-punchline',
        role: 'punchline_loop',
        start_sec: 11.0,
        end_sec: 14.0,
        voiceover_cz: 'Konec smyčky.',
        subtitle_text: 'Konec smyčky.',
        visual_direction: 'Zoom',
      },
    ],
  });

  const fixedManifest = makeValidBaseManifest({
    humor_angle: 'unikátní ostravský pragmatismus v korporátu',
    ypp_score: 97,
  });

  let repairDiagnosisReceived = '';

  const result = await runTitanCoreMadLipz({
    visualDescription: 'Kočka na pondělní poradě',
    durationSec: 15,
    seriesName: 'Kancelář CZ',
    engineExecutors: [
      {
        name: 'mock-engine-1',
        run: async () => defectiveDraft,
      },
      {
        name: 'mock-engine-2',
        run: async (ctx) => {
          repairDiagnosisReceived = ctx.diagnosis || '';
          return fixedManifest;
        },
      },
    ],
  });

  assert.equal(result.manifest.healing_iterations, 1, 'Self-healing should resolve in 1 iteration via Engine 2');
  assert.equal(result.audit.passed, true);
  assert.ok(result.manifest.ypp_score >= 92);
  assert.ok(repairDiagnosisReceived.includes('HOOK_TIMING'));
  assert.ok(repairDiagnosisReceived.includes('YPP_COMPLIANCE'));
  assert.equal(result.manifest.engine_used, 'mock-engine-2');

  const bannedAfterSave = retrieveBannedHumorAngles('Kancelář CZ', 10);
  assert.ok(
    bannedAfterSave.some((a) => a.includes('ostravský pragmatismus')),
    'Saved humor_angle should be retrievable from hybrid memory to avoid Repetitious Content'
  );
});

test('TitanCore Test 3: POST /v1/factory/generations persists manifest to ./tmp/, records RunTrace, enriches /v1/factory/assets and returns ypp_score >= 92 + >= 6 next_commands', async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  let createdManifestPath: string | undefined;

  try {
    const genRes = await fetch(`${baseUrl}/v1/factory/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visualDescription: 'Programátor v kuchyňce hledá čistý hrnek při výpadku produkce',
        durationSec: 15,
        seriesName: 'DevOps Denně CZ',
        episodeNumber: 3,
      }),
    });

    assert.equal(genRes.status, 201);
    const body = (await genRes.json()) as any;

    assert.equal(body.status, 'ok');
    assert.ok(body.ypp_score >= 92, `Expected ypp_score >= 92, got ${body.ypp_score}`);
    assert.ok(Array.isArray(body.next_commands));
    assert.ok(body.next_commands.length >= 6, `Expected >= 6 next_commands, got ${body.next_commands.length}`);
    assert.equal(body.manifest.pipeline_target, 'wedikcz/video');
    assert.equal(body.manifest.target_duration_sec, 15);
    assert.ok(body.manifest.asset_bridge.opensourcegen_prompt.length > 20);
    assert.equal(body.manifest.asset_bridge.agnes_manifest.generator, 'agnes-video-generator');

    createdManifestPath = body.manifestPath;
    assert.ok(createdManifestPath && fs.existsSync(createdManifestPath), 'Manifest JSON must be written to ./tmp/');

    const traceRes = await fetch(`${baseUrl}/v1/runs/${body.runId}`);
    assert.equal(traceRes.status, 200);
    const trace = (await traceRes.json()) as any;
    assert.equal(trace.id, body.runId);
    assert.ok(trace.totalTokens > 0);
    assert.ok(typeof trace.costCzk === 'number');
    assert.ok(Array.isArray(trace.spans) && trace.spans.length >= 2);

    const assetsRes = await fetch(`${baseUrl}/v1/factory/assets`);
    assert.equal(assetsRes.status, 200);
    const assetsList = (await assetsRes.json()) as any[];
    const createdAsset = assetsList.find((a) => a.id === body.asset.id);
    assert.ok(createdAsset, 'Created asset should appear in GET /v1/factory/assets');
    assert.ok(createdAsset.yppScore >= 92);
    assert.ok(createdAsset.openSourceGenPrompt);
    assert.ok(createdAsset.agnesManifest);
    assert.ok(Array.isArray(createdAsset.nextCommands) && createdAsset.nextCommands.length >= 6);

    const adRes = await fetch(`${baseUrl}/v1/factory/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: 'ad', topic: 'MadLipz AI Automatizace' }),
    });
    assert.equal(adRes.status, 200);
    const adJson = (await adRes.json()) as any;
    assert.ok(adJson.runId && adJson.traceUrl);
    assert.ok(Array.isArray(adJson.next_commands) && adJson.next_commands.length >= 6);
  } finally {
    if (createdManifestPath && fs.existsSync(createdManifestPath)) {
      fs.unlinkSync(createdManifestPath);
    }
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
