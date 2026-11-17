/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

process.env.NEXUS_SKIP_LISTEN = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { resolveGradientPalette } from '../src/server/runtime/mediaRenderer.ts';
import { VideoDirectorEngine } from '../src/server/runtime/videoDirector.ts';
import { BoardroomEngine } from '../src/server/boardroom.ts';
import { AgentOrchestrator } from '../src/server/runtime/orchestrator.ts';
import { db } from '../src/server/db.ts';
import { app } from '../server.ts';

test('NotebookLM cutout style: resolveGradientPalette & detectExplicitStyle handle vystrihovanka', async () => {
  const cutout = resolveGradientPalette('vystrihovanka');
  const board = resolveGradientPalette('tabule');
  assert.notEqual(cutout.c0, board.c0);
  assert.equal(cutout.hex, '0xf59e0b');

  const analysis = await VideoDirectorEngine.analyzePrompt({
    userMessage: 'Vytvoř 3 videa na TikTok (9:16), vizuální styl vystřihovanka styl na téma AI produktivita',
    useGemini: false,
  });
  assert.equal(analysis.brief.notebookStyle, 'vystrihovanka');
  assert.equal(analysis.batchCount, 3);
});

test('BoardroomEngine: adapts verdict, summary & round votes to distinct debate topics', async () => {
  const budgetSession = await BoardroomEngine.conveneSession(
    'Snížení denního budgetu a konzervace cashflow'
  );
  const nightSession = await BoardroomEngine.conveneSession(
    'Aktivace automatické noční render smyčky'
  );

  assert.notEqual(budgetSession.verdict, nightSession.verdict);
  assert.notEqual(budgetSession.summary, nightSession.summary);
  assert.equal(budgetSession.rounds.round1_positions.length, 7);
  assert.equal(budgetSession.rounds.round2_critique.length, 4);
  assert.equal(budgetSession.rounds.round3_compromise.length, 7);
});

test('RBAC & Kill Switch & Revenue Autonomous Loop HTTP Contracts', async () => {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const viewerHeaders = {
    'Content-Type': 'application/json',
    'x-nexus-actor-id': 'usr-viewer-1',
  };
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-nexus-actor-id': 'usr-admin-1',
  };

  try {
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. RBAC: Viewer must be denied with 403 on all mutating endpoints
    const agentId = db.agents[0]?.id || 'agent-ceo';
    const oppId = db.opportunities[0]?.id || 'opp-1';
    const commentId = db.comments[0]?.id || 'cmt-001';

    const rbacChecks = await Promise.all([
      fetch(`${baseUrl}/v1/agents/${agentId}`, {
        method: 'PATCH',
        headers: viewerHeaders,
        body: JSON.stringify({ status: 'paused' }),
      }),
      fetch(`${baseUrl}/v1/opportunities/${oppId}`, {
        method: 'PATCH',
        headers: viewerHeaders,
        body: JSON.stringify({ status: 'paused' }),
      }),
      fetch(`${baseUrl}/v1/revenue/autonomous-loop`, {
        method: 'POST',
        headers: viewerHeaders,
        body: JSON.stringify({ active: false }),
      }),
      fetch(`${baseUrl}/v1/boardroom/sessions`, {
        method: 'POST',
        headers: viewerHeaders,
        body: JSON.stringify({ topic: 'Test' }),
      }),
      fetch(`${baseUrl}/api/v1/opengen/credits/topup`, {
        method: 'POST',
        headers: viewerHeaders,
        body: JSON.stringify({ tier: 'creator' }),
      }),
      fetch(`${baseUrl}/v1/comments`, {
        method: 'POST',
        headers: viewerHeaders,
        body: JSON.stringify({ text: 'Test comment', platform: 'TikTok' }),
      }),
      fetch(`${baseUrl}/v1/comments/${commentId}/analyze`, {
        method: 'POST',
        headers: viewerHeaders,
        body: JSON.stringify({}),
      }),
    ]);

    for (const res of rbacChecks) {
      assert.equal(res.status, 403, `Expected 403 Forbidden for viewer on ${res.url}, got ${res.status}`);
    }

    // 2. Autonomous Revenue Loop state persistence + metrics summary sync
    const loopOffRes = await fetch(`${baseUrl}/v1/revenue/autonomous-loop`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ active: false }),
    });
    assert.equal(loopOffRes.status, 200);
    const loopOffJson = await loopOffRes.json();
    assert.equal(loopOffJson.isAutonomousRevenueLoopActive, false);

    const loopGetRes = await fetch(`${baseUrl}/v1/revenue/autonomous-loop`);
    assert.equal(loopGetRes.status, 200);
    assert.equal((await loopGetRes.json()).isAutonomousRevenueLoopActive, false);

    const metricsRes = await fetch(`${baseUrl}/v1/metrics/summary`);
    assert.equal(metricsRes.status, 200);
    assert.equal((await metricsRes.json()).isAutonomousRevenueLoopActive, false);

    const loopOnRes = await fetch(`${baseUrl}/v1/revenue/autonomous-loop`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ active: true }),
    });
    assert.equal(loopOnRes.status, 200);
    assert.equal((await loopOnRes.json()).isAutonomousRevenueLoopActive, true);

    // 3. Emergency Kill Switch blocks generation, boardroom, publish & orchestrator with 423 Locked
    const pauseOnRes = await fetch(`${baseUrl}/v1/system/pause`, {
      method: 'POST',
      headers: adminHeaders,
    });
    assert.equal(pauseOnRes.status, 200);
    assert.equal((await pauseOnRes.json()).isSystemPaused, true);

    const pausedOpenGen = await fetch(`${baseUrl}/api/v1/opengen/generate`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ prompt: 'Test video', modelId: 'nexus-local-director' }),
    });
    assert.equal(pausedOpenGen.status, 423);

    const pausedBoardroom = await fetch(`${baseUrl}/v1/boardroom/sessions`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ topic: 'Test topic' }),
    });
    assert.equal(pausedBoardroom.status, 423);

    const pausedFactory = await fetch(`${baseUrl}/v1/factory/generations`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ line: 'video', topic: 'Test' }),
    });
    assert.equal(pausedFactory.status, 423);

    const pausedPublish = await fetch(`${baseUrl}/v1/publish`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ videoTitle: 'Test', assetId: 'asset-001', platforms: ['youtube_shorts'] }),
    });
    assert.equal(pausedPublish.status, 423);

    const pausedAutopilot = await fetch(`${baseUrl}/v1/comments/swarm/autopilot`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({}),
    });
    assert.equal(pausedAutopilot.status, 423);

    const pausedChat = await AgentOrchestrator.executeGoal({
      threadId: `th-paused-${Date.now()}`,
      userMessage: 'Vytvoř mi 5 tik tok videí',
      dryRun: true,
    });
    assert.ok(pausedChat.message.content.includes('Kill Switch'));
    assert.equal(pausedChat.message.generatedAssets, undefined);
  } finally {
    // Always restore active system state cleanly
    if (db.isSystemPaused) {
      db.isSystemPaused = false;
    }
    db.isAutonomousRevenueLoopActive = true;
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
