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
  buildCameraTrajectoryForBeat,
  compileStructuredPromptText,
  enhanceStructuredPromptLocally,
  parseStructuredPromptFromText,
  rebalanceTemporalBeats,
  scoreStructuredPromptCompleteness,
} from '../src/utils/structuredVideoPrompt.ts';
import {
  MONETIZATION_CHEATSHEETS,
  VISUAL_DRAG_TAGS,
  applyBlueprintToPrompt,
  applyVisualTagToPrompt,
  evaluateMonetizationReadiness,
  optimizePromptForMonetization,
  removeVisualTagFromPrompt,
} from '../src/utils/monetizationCheatsheets.ts';
import { VideoDirectorEngine } from '../src/server/runtime/videoDirector.ts';
import { MoviePyCompiler } from '../src/server/runtime/moviepy.ts';
import { MediaRenderer, inspectMp4Atoms } from '../src/server/runtime/mediaRenderer.ts';
import { SmartVideoOrchestrator } from '../src/services/SmartVideoOrchestrator.ts';
import { app } from '../server.ts';

test('StructuredVideoPrompt NLP: 4-pillar extraction, temporal rebalancing & zero-API local enhancement', () => {
  const raw =
    'Nejdříve nízký FPV dronový průlet nad mokrou futuristickou Prahou v dešti a neonu, pak plynulý orbit 360 kolem centrální skleněné věže, nakonec rychlý odjezd do celku 9s.';

  const parsed = parseStructuredPromptFromText(raw);

  // Pillar 1: Subject & Composition
  assert.ok(parsed.subject.primarySubject.length >= 5);
  assert.equal(parsed.subject.composition, 'pov_first_person');
  assert.ok(parsed.subject.environment.length >= 6);

  // Pillar 2: Style, Lighting, Optics, Atmosphere
  assert.equal(parsed.style.visualStyle, 'cyberpunk_neon');
  assert.equal(parsed.style.lighting, 'volumetric_neon');
  assert.equal(parsed.style.optics, '16mm_wide_fpv');
  assert.equal(parsed.style.atmosphere, 'rain_particles');

  // Pillar 3: Camera Motion
  assert.equal(parsed.camera.primaryMotion, 'fpv_drone');
  assert.ok(parsed.camera.motionIntensity >= 6);

  // Pillar 4: Temporal Scene Progression
  assert.equal(parsed.totalDurationSec, 9);
  assert.equal(parsed.temporal.beats.length, 3);
  const sumDuration = parsed.temporal.beats.reduce((acc, b) => acc + b.durationSec, 0);
  assert.ok(Math.abs(sumDuration - 9) < 0.15, `Expected beat sum ~9s, got ${sumDuration}`);
  assert.equal(parsed.temporal.beats[0].phase, 'opening_hook');
  assert.equal(parsed.temporal.beats[1].cameraKeyframe, 'orbit_360');
  assert.equal(parsed.temporal.beats[2].cameraKeyframe, 'zoom_out');

  // Completeness score should be high across all 4 pillars
  const score = scoreStructuredPromptCompleteness(parsed);
  assert.ok(score.overall >= 90, `Expected score >= 90, got ${score.overall}`);
  assert.equal(score.pillars.subject, 25);
  assert.equal(score.pillars.style, 25);
  assert.equal(score.pillars.camera, 25);

  // Zero-API enhancement & compiled directive
  const enhanced = enhanceStructuredPromptLocally(parsed, {
    motionIntensity: 9,
  });
  assert.equal(enhanced.structuredPrompt.engine, 'local-structured-director');
  assert.equal(enhanced.structuredPrompt.camera.motionIntensity, 9);
  assert.ok(enhanced.compiledText.includes('[SUBJEKT]'));
  assert.ok(enhanced.compiledText.includes('[STYL]'));
  assert.ok(enhanced.compiledText.includes('[KAMERA]'));
  assert.ok(enhanced.compiledText.includes('[ČASOVÝ VÝVOJ'));
  assert.ok(enhanced.tips.length >= 3);

  // Camera trajectory helper & beat rebalancing
  const traj = buildCameraTrajectoryForBeat('zoom_in', 8, 'opening_hook');
  assert.ok(traj.zoomEnd > traj.zoomStart);

  const rebalanced = rebalanceTemporalBeats(parsed.temporal.beats, 12);
  const lastEnd = rebalanced[rebalanced.length - 1].endSec;
  assert.equal(lastEnd, 12);

  const compiled = compileStructuredPromptText(enhanced.structuredPrompt);
  assert.ok(compiled.includes('Prahou'));
});

test('Visual Prompt Builder Tags & 100% Monetization Cheatsheets Engine', () => {
  const base = parseStructuredPromptFromText('AI automatizace pracovního dne 6s');

  const fpvTag = VISUAL_DRAG_TAGS.find((t) => t.id === 'cam-fpv-drone');
  const panRightTag = VISUAL_DRAG_TAGS.find((t) => t.id === 'cam-pan-right');
  const opticsTag = VISUAL_DRAG_TAGS.find((t) => t.id === 'optics-35mm-anamorphic');
  const realismTag = VISUAL_DRAG_TAGS.find((t) => t.id === 'real-arri-logc4');
  assert.ok(fpvTag && panRightTag && opticsTag && realismTag);

  // Apply global dropzone tags + beat-targeted camera drop
  let updated = applyVisualTagToPrompt(base, fpvTag).structuredPrompt;
  updated = applyVisualTagToPrompt(updated, panRightTag, updated.temporal.beats[1]?.id).structuredPrompt;
  updated = applyVisualTagToPrompt(updated, opticsTag).structuredPrompt;
  updated = applyVisualTagToPrompt(updated, realismTag).structuredPrompt;

  assert.equal(updated.camera.primaryMotion, 'fpv_drone');
  assert.equal(updated.temporal.beats[1].cameraKeyframe, 'pan_right');
  assert.equal(updated.style.optics, '35mm_anamorphic');
  assert.ok(updated.activeTagIds?.includes('cam-fpv-drone'));
  assert.ok(updated.activeTagIds?.includes('cam-pan-right'));
  assert.ok(updated.activeTagIds?.includes('optics-35mm-anamorphic'));
  assert.ok(updated.activeTagIds?.includes('real-arri-logc4'));
  assert.ok(updated.rawPrompt.includes(fpvTag.promptSnippet));

  // Remove tag cleanly
  const afterRemove = removeVisualTagFromPrompt(updated, 'cam-fpv-drone');
  assert.ok(!afterRemove.activeTagIds?.includes('cam-fpv-drone'));

  // Apply blueprint
  const bp = MONETIZATION_CHEATSHEETS[0];
  const fromBlueprint = applyBlueprintToPrompt(base, bp);
  assert.equal(fromBlueprint.aspectRatio, bp.format);
  assert.ok(fromBlueprint.monetizationKit?.seoTitle.length);

  // Optimize for 100% monetization readiness
  const optimized = optimizePromptForMonetization(base, bp.id);
  assert.equal(optimized.audit.score, 100);
  assert.equal(optimized.audit.is100PercentMonetizable, true);
  assert.equal(optimized.audit.adSafe, true);
  assert.ok(optimized.audit.checks.every((c) => c.passed));

  // Ad-safety detection flags risky terms
  const unsafe = evaluateMonetizationReadiness(
    parseStructuredPromptFromText('Rychlé peníze v kasino hazardu 6s')
  );
  assert.equal(unsafe.adSafe, false);
  assert.ok(unsafe.score < 100);
});

test('VideoDirectorEngine + MoviePyCompiler + MediaRenderer: compile & render structured 4-pillar prompt to +faststart MP4', async () => {
  const sp = parseStructuredPromptFromText(
    'Nejdříve makro detail zlaté cremy v espressu při ranním slunci, pak orbit 360 kolem šálku, nakonec klidný odjezd 6s.'
  );

  const analysis = await VideoDirectorEngine.analyzePrompt({
    userMessage: sp.rawPrompt,
    structuredPrompt: sp,
  });

  assert.equal(analysis.needsClarification, false);
  const brief = analysis.brief;
  assert.equal(brief.engineUsed, 'local-structured-director');
  assert.equal(brief.completenessScore, 100);
  assert.equal(brief.visualStyle, 'luxury_gold');
  assert.ok(brief.structuredPrompt);

  const storyboard = MoviePyCompiler.createBriefDrivenStoryboard(brief);
  assert.ok(storyboard.structuredPrompt);
  assert.equal(storyboard.scenes.length, sp.temporal.beats.length);

  const pyScript = MoviePyCompiler.generatePythonScript(storyboard);
  assert.ok(pyScript.includes('Structured Prompt (Zero-API Local Director v2.0)'));
  assert.ok(pyScript.includes('.resized(lambda t:'));

  // Render real playable MP4 using structured prompt keyframes & transitions
  const rendered = await MediaRenderer.renderVideoMp4({
    assetId: 'asset-structured-ffmpeg-test',
    threadId: 'th-structured-test',
    title: 'Luxusní Espresso Makro',
    format: sp.aspectRatio,
    durationSec: 4,
    brief,
    structuredPrompt: sp,
    dryRun: false,
  });

  assert.equal(rendered.renderedWithFfmpeg, true, 'FFmpeg must render structured MP4');
  assert.equal(rendered.faststartVerified, true, '+faststart moov atom must precede mdat');
  assert.ok(rendered.sizeBytes > 10000);
  assert.ok(fs.existsSync(rendered.filePath));
  assert.ok(fs.existsSync(rendered.posterPath));

  const atoms = inspectMp4Atoms(rendered.filePath);
  assert.equal(atoms.valid, true);
  assert.equal(atoms.moovBeforeMdat, true);
});

test('HTTP Structured Prompt API & Zero-API nexus-local-director Engine (0 credits, 202 -> ready)', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const orchestrator = new SmartVideoOrchestrator(baseUrl);

  try {
    // 1. Catalog includes zero-API local director at index 0
    const catalog = await orchestrator.getOpenGenModels();
    const localModel = catalog.models.find((m) => m.id === 'nexus-local-director');
    assert.ok(localModel, 'nexus-local-director must exist in catalog');
    assert.equal(localModel.creditCost, 0);

    const creditsBefore = catalog.credits.available;

    // 2. Parse endpoint
    const parsedRes = await orchestrator.parseStructuredPrompt({
      rawPrompt:
        'Nejdříve průlet FPV dronem nad datovým centrem, pak švenk vpravo na hologramy, nakonec odjezd 6s.',
      aspectRatio: '9:16',
    });
    assert.equal(parsedRes.engine, 'local-structured-director');
    assert.ok(parsedRes.structuredPrompt.temporal.beats.length >= 3);
    assert.ok(parsedRes.score.overall >= 85);

    // 3. Enhance endpoint
    const enhancedRes = await orchestrator.enhanceStructuredPrompt({
      structuredPrompt: parsedRes.structuredPrompt,
      motionIntensity: 9,
    });
    assert.equal(enhancedRes.structuredPrompt.camera.motionIntensity, 9);
    assert.ok(enhancedRes.compiledText.includes('[ČASOVÝ VÝVOJ'));

    // 3b. Monetize optimization endpoint
    const monetizedRes = await orchestrator.optimizeForMonetization({
      structuredPrompt: enhancedRes.structuredPrompt,
      blueprintId: MONETIZATION_CHEATSHEETS[0].id,
    });
    assert.equal(monetizedRes.audit.score, 100);
    assert.equal(monetizedRes.audit.is100PercentMonetizable, true);
    assert.ok(monetizedRes.structuredPrompt.monetizationKit?.seoTitle);

    // 4. Async 202 generation via nexus-local-director spends 0 credits
    const genResult = await orchestrator.generateOpenGenVideo(
      {
        modelId: 'nexus-local-director',
        mode: 'text_to_video',
        prompt: monetizedRes.structuredPrompt.rawPrompt,
        aspectRatio: '9:16',
        durationSec: 4,
        cameraMotion: 'fpv_drone',
        motionIntensity: 9,
        fps: 30,
        qualityTier: '1080p',
        promptMagic: true,
        structuredPrompt: monetizedRes.structuredPrompt,
      },
      {
        pollIntervalMs: 250,
        maxPolls: 40,
      }
    );

    assert.equal(genResult.received202Accepted, true);
    assert.equal(genResult.creditsUsed, 0);
    assert.equal(genResult.creditsRemaining, creditsBefore);
    assert.equal(genResult.asset.status, 'ready');
    assert.equal(genResult.asset.faststartVerified, true);
    assert.ok(genResult.asset.structuredPrompt);
    assert.ok(genResult.moviePyScript?.includes('Structured Prompt (Zero-API Local Director v2.0)'));
    assert.ok((genResult.asset.sizeBytes || 0) > 10000);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
