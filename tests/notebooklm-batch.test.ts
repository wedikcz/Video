/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VideoDirectorEngine } from '../src/server/runtime/videoDirector.ts';
import { AgentOrchestrator } from '../src/server/runtime/orchestrator.ts';
import { resolveGradientPalette } from '../src/server/runtime/mediaRenderer.ts';
import { buildNotebookLMPrompt } from '../src/components/NotebookLMStudioModal.tsx';

test('resolveGradientPalette maps NotebookLM visual styles to distinct gradient palettes', () => {
  const anime = resolveGradientPalette('anime');
  const board = resolveGradientPalette('tabule');
  const watercolor = resolveGradientPalette('akvarel');
  const fintech = resolveGradientPalette('fintech_emerald');

  assert.notEqual(anime.c0, fintech.c0);
  assert.notEqual(board.c0, watercolor.c0);
  assert.ok(anime.hex.startsWith('0x'));
  assert.ok(board.sec.startsWith('0x'));
});

test('buildNotebookLMPrompt constructs structured batch prompt from modal configuration', () => {
  const prompt = buildNotebookLMPrompt({
    format: '9:16',
    batchCount: 5,
    language: 'Čeština (výchozí)',
    sourceCount: 18,
    visualStyle: 'board',
    customPrompt: 'jak AI šetří čas podnikatelům',
    narrativeFocus: 'jak AI šetří čas podnikatelům',
  });

  assert.ok(prompt.includes('5 videí'));
  assert.ok(prompt.includes('TikTok (9:16)'));
  assert.ok(prompt.includes('tabule styl'));
  assert.ok(prompt.includes('18 zdrojů'));
  assert.ok(prompt.includes('jak AI šetří čas podnikatelům'));
});

test('VideoDirectorEngine: detects "vytvoř mi 5 tik tok videí", builds 5 unique episodes + Deep Thinking Trace', async () => {
  const analysis = await VideoDirectorEngine.analyzePrompt({
    userMessage: 'vytvoř mi 5 tik tok videí',
    useGemini: false,
  });

  assert.equal(analysis.isVideoIntent, true);
  assert.equal(analysis.needsClarification, false);
  assert.equal(analysis.batchCount, 5);
  assert.ok(analysis.reasoningTrace);
  assert.equal(analysis.reasoningTrace.structuredPillars.length, 5);
  assert.ok(analysis.reasoningTrace.agentConsensus.length >= 3);
  assert.ok(analysis.videoBatchSuite);
  assert.equal(analysis.videoBatchSuite.episodesCount, 5);
  assert.ok(analysis.batchBriefs && analysis.batchBriefs.length === 5);

  const uniqueTitles = new Set(analysis.batchBriefs.map((b) => b.title));
  const uniqueHooks = new Set(analysis.batchBriefs.map((b) => b.hook));
  assert.equal(uniqueTitles.size, 5, 'Each batch episode should have a unique title');
  assert.equal(uniqueHooks.size, 5, 'Each batch episode should have a unique viral hook');
  for (const b of analysis.batchBriefs) {
    assert.equal(b.aspectRatio, '9:16');
    assert.ok(b.scenes.length >= 3);
  }
});

test('VideoDirectorEngine: preserves custom topic + NotebookLM style across all 5 batch episodes', async () => {
  const analysis = await VideoDirectorEngine.analyzePrompt({
    userMessage: 'Vytvoř 5 videí na YouTube (16:9), vizuální styl anime styl na téma budoucnost kvantových počítačů',
    useGemini: false,
  });

  assert.equal(analysis.batchCount, 5);
  assert.equal(analysis.brief.notebookStyle, 'anime');
  assert.equal(analysis.brief.aspectRatio, '16:9');
  assert.ok(analysis.batchBriefs && analysis.batchBriefs.length === 5);
  for (const ep of analysis.batchBriefs) {
    assert.equal(ep.aspectRatio, '16:9');
    assert.equal(ep.notebookStyle, 'anime');
  }
});

test('AgentOrchestrator: renders 5 distinct playable faststart MP4s with reasoningTrace & videoBatchSuite', async () => {
  const streamedEvents: Array<{ type: string; data: any }> = [];
  const res = await AgentOrchestrator.executeGoal({
    threadId: `th-batch-e2e-${Date.now()}`,
    userMessage: 'vytvoř mi 5 tik tok videí',
    dryRun: false,
    onStreamEvent: (ev) => streamedEvents.push(ev),
  });

  assert.ok(streamedEvents.some((e) => e.type === 'span' && e.data?.stage === 'thinking'));
  assert.ok(streamedEvents.some((e) => e.type === 'tool_event' && e.data?.tool === 'render_video_mp4'));
  assert.ok(res.message.reasoningTrace, 'Message should include ReasoningTrace');
  assert.ok(res.message.videoBatchSuite, 'Message should include VideoBatchSuite');
  assert.equal(res.message.videoBatchSuite.episodesCount, 5);
  assert.ok(res.message.generatedAssets && res.message.generatedAssets.length === 5);

  const hashes = new Set<string>();
  for (const asset of res.message.generatedAssets) {
    assert.equal(asset.line, 'video');
    assert.equal(asset.status, 'ready');
    assert.equal(asset.faststartVerified, true);
    assert.ok((asset.sizeBytes || 0) > 15000, `Expected rich rendered MP4 >15KB, got ${asset.sizeBytes}`);
    assert.ok(asset.filePath && fs.existsSync(asset.filePath));
    assert.ok(asset.sha256);
    hashes.add(asset.sha256);
  }
  assert.equal(hashes.size, 5, 'All 5 rendered MP4 files must have unique content checksums');
});

test('AgentOrchestrator: handles NotebookLM prompt with parentheses (9:16), (výchozí), (18 zdrojů) cleanly', async () => {
  const nlmPrompt = buildNotebookLMPrompt({
    format: '9:16',
    batchCount: 5,
    language: 'Čeština (výchozí)',
    sourceCount: 18,
    visualStyle: 'board',
    customPrompt: 'Vytvoř 5 virálních videí na TikTok s dynamickým střihem',
    narrativeFocus: '',
  });
  assert.ok(!nlmPrompt.includes('na téma na TikTok'), 'Should strip boilerplate cleanly');

  const res = await AgentOrchestrator.executeGoal({
    threadId: `th-nlm-regress-${Date.now()}`,
    userMessage: nlmPrompt,
    dryRun: true,
  });

  assert.ok(res.message.reasoningTrace);
  assert.ok(res.message.videoBatchSuite);
  assert.equal(res.message.videoBatchSuite.episodesCount, 5);
  assert.equal(res.message.generatedAssets?.length, 5);
});
