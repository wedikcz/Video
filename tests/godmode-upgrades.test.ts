/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

process.env.NEXUS_SKIP_LISTEN = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { app } from '../server.ts';
import { db } from '../src/server/db.ts';
import {
  computeAgentRevenueContributions,
  inferAssetAgentAttribution,
} from '../src/server/runtime/revenueAttribution.ts';
import {
  buildOptimizedBatchSchedule,
  createBatchQueueItem,
  getNextScheduledBatchItem,
} from '../src/utils/batchVideoQueue.ts';
import {
  generateAdaptableMcpEndpoint,
  handleMcpJsonRpc,
  healMultiGenParameters,
  normalizeMcpOutput,
  runMultiGenToolkit,
} from '../src/engines/mcp_hub.ts';

test('Revenue Attribution Engine: links assets & opportunities to specific agents and computes leaderboard KPIs', () => {
  const { agents, summary } = computeAgentRevenueContributions(
    db.agents,
    db.factoryAssets,
    db.opportunities,
    db.activities
  );

  assert.equal(agents.length, db.agents.length);
  assert.ok(summary.totalAttributedRevenueCzk > 0, 'Total attributed revenue must be > 0');
  assert.ok(summary.topAgentName.length > 0, 'Top contributing agent must be identified');

  const videoAgent = agents.find((a) => a.id === 'agent-video');
  assert.ok(videoAgent && (videoAgent.revenueContributionCzk || 0) > 0, 'Video Agent must receive revenue attribution');

  const inferred = inferAssetAgentAttribution({
    id: 'asset-x',
    threadId: 'th-1',
    line: 'video',
    title: 'Test Short',
    body: 'Test video asset body',
    meta: '9:16 · Test',
    createdAt: new Date().toISOString(),
  });
  assert.equal(inferred.agentId, 'agent-video');
});

test('Automated Batch Scheduler: groups similar tasks into chunks and reduces overhead', () => {
  const itemA1 = createBatchQueueItem({
    id: 'q-a1',
    prompt: 'Scéna A1 neon',
    modelId: 'wan-2-2',
    modelName: 'Wan 2.2 Turbo (Open)',
    creditCost: 4,
    format: '9:16',
    visualStyle: 'cyberpunk_neon',
  });
  const itemB1 = createBatchQueueItem({
    id: 'q-b1',
    prompt: 'Scéna B1 gold',
    modelId: 'ltx-2-5',
    modelName: 'LTX-Video 2.5',
    creditCost: 4,
    format: '16:9',
    visualStyle: 'luxury_gold',
  });
  const itemA2 = createBatchQueueItem({
    id: 'q-a2',
    prompt: 'Scéna A2 neon',
    modelId: 'wan-2-2',
    modelName: 'Wan 2.2 Turbo (Open)',
    creditCost: 4,
    format: '9:16',
    visualStyle: 'cyberpunk_neon',
  });

  const optimized = buildOptimizedBatchSchedule([itemA1, itemB1, itemA2], {
    autoChunkOptimize: true,
    maxChunkSize: 3,
  });

  assert.equal(optimized.totalQueuedTasks, 3);
  assert.equal(optimized.totalChunks, 2, 'Should group 2 matching WAN 9:16 tasks and 1 LTX 16:9 task into 2 chunks');
  assert.ok(optimized.estimatedOverheadSavedPercent > 0, 'Optimized chunking must estimate positive overhead savings');
  assert.equal(optimized.chunks[0].itemCount, 2, 'Larger homogeneous chunk should execute first');
  assert.deepEqual(optimized.chunks[0].itemIds, ['q-a1', 'q-a2']);

  const next = getNextScheduledBatchItem([itemA1, itemB1, itemA2], {
    autoChunkOptimize: true,
    maxChunkSize: 3,
  });
  assert.equal(next?.id, 'q-a1');

  const fifo = buildOptimizedBatchSchedule([itemA1, itemB1, itemA2], {
    autoChunkOptimize: false,
    maxChunkSize: 2,
  });
  assert.equal(fifo.estimatedOverheadSavedPercent, 0);
  assert.equal(fifo.totalChunks, 2);
});

test('Godmode-TitanCore MCP Hub: self-healing params, output truncation, sandbox security, and JSON-RPC 2.0', async () => {
  // Level-1 parameter self-healing
  const healed = healMultiGenParameters({
    type: 'memes',
    modelId: 'LTX-2.5',
    aspectRatio: 'invalid-ratio',
    durationSec: 99,
    prompt: 'AI automatizace ve 3 ráno',
  });
  assert.equal(healed.healed.type, 'meme');
  assert.equal(healed.healed.modelId, 'ltx-2-5');
  assert.equal(healed.healed.aspectRatio, '1:1');
  assert.equal(healed.healed.durationSec, 15);
  assert.ok(healed.healingEvents.length >= 3, 'Should log self-healing repairs');

  // Output normalization > 8,000 chars
  const big = { blob: 'x'.repeat(12000) };
  const norm = normalizeMcpOutput(big);
  assert.equal(norm.truncated, true);

  // Security sandbox rejects command injection & path traversal
  assert.throws(() =>
    generateAdaptableMcpEndpoint({
      name: 'evil-ep',
      transport: 'stdio',
      targetUrlOrCommand: 'npx @mcp/server; rm -rf /',
    })
  );

  assert.throws(() =>
    generateAdaptableMcpEndpoint({
      name: 'bad-path',
      transport: 'stdio',
      targetUrlOrCommand: 'python3 ../../etc/passwd',
    })
  );

  const goodEp = generateAdaptableMcpEndpoint({
    name: 'test-httpx-hook',
    transport: 'httpx_webhook',
    targetUrlOrCommand: 'http://localhost:3000/v1/mcp/rpc',
    authMode: 'hmac_sha256',
  });
  assert.ok(goodEp.id);
  assert.ok(goodEp.httpxPythonCode.includes('httpx.AsyncClient'));
  assert.ok(goodEp.stdioConfigJson.includes('mcpServers'));

  // JSON-RPC 2.0 initialize & tools/list
  const initRes = await handleMcpJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
  });
  assert.equal((initRes.result as any).protocolVersion, '2025-11-05');

  const listRes = await handleMcpJsonRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  });
  assert.ok(Array.isArray((listRes.result as any).tools));
  assert.ok((listRes.result as any).tools.length >= 3);

  // MultiGen Toolkit unit execution (sketch & meme)
  const sketchRes = await runMultiGenToolkit({
    type: 'sketch',
    modelId: 'wan-2-2',
    prompt: 'Autonomní drone studio blueprint',
    aspectRatio: '1:1',
  });
  assert.equal(sketchRes.artifact.type, 'sketch');
  assert.ok(sketchRes.artifact.previewSvgDataUri?.startsWith('data:image/svg+xml'));
});

test('HTTP Integration: Boardroom Revenue, Batch Schedule, MultiGen Toolkit, ChatOS modelId, and MCP Hub endpoints', async () => {
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Revenue Contribution API
    const revRes = await fetch(`${baseUrl}/v1/agents/revenue-contribution`);
    assert.equal(revRes.status, 200);
    const revBody = await revRes.json();
    assert.ok(Array.isArray(revBody.agents) && revBody.agents.length >= 16);
    assert.ok(revBody.summary.totalAttributedRevenueCzk > 0);

    // 2. Batch Schedule API
    const schedRes = await fetch(`${baseUrl}/v1/factory/batch/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        autoChunkOptimize: true,
        maxChunkSize: 3,
        items: [
          createBatchQueueItem({
            id: 'h1',
            prompt: 'Hook 1',
            modelId: 'wan-2-2',
            modelName: 'Wan 2.2 Turbo (Open)',
            creditCost: 4,
            format: '9:16',
            visualStyle: 'cyberpunk_neon',
          }),
          createBatchQueueItem({
            id: 'h2',
            prompt: 'Hook 2',
            modelId: 'wan-2-2',
            modelName: 'Wan 2.2 Turbo (Open)',
            creditCost: 4,
            format: '9:16',
            visualStyle: 'cyberpunk_neon',
          }),
        ],
      }),
    });
    assert.equal(schedRes.status, 200);
    const schedBody = await schedRes.json();
    assert.equal(schedBody.totalChunks, 1);
    assert.ok(schedBody.estimatedOverheadSavedPercent > 0);

    // 3. MultiGen API + ChatOS MultiGen dispatch
    const mgRes = await fetch(`${baseUrl}/v1/multigen/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'meme',
        modelId: 'ltx-2-5',
        prompt: 'Když agent automaticky vyřeší produkční bug',
        aspectRatio: '1:1',
      }),
    });
    assert.equal(mgRes.status, 201);
    const mgBody = await mgRes.json();
    assert.equal(mgBody.artifact.modelId, 'ltx-2-5');
    assert.equal(mgBody.artifact.type, 'meme');

    const chatRes = await fetch(`${baseUrl}/v1/threads/th-main-001/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Cyberpunk architektura budoucnosti',
        modelId: 'wan-2-2',
        multiGenMode: 'image',
      }),
    });
    assert.equal(chatRes.status, 200);
    const chatBody = await chatRes.json();
    assert.ok(Array.isArray(chatBody.multiGenArtifacts) && chatBody.multiGenArtifacts.length === 1);
    assert.equal(chatBody.multiGenArtifacts[0].modelId, 'wan-2-2');

    // 4. Futuristic Avatars generation via Media Generation Toolkit
    const wanAvatarRes = await fetch(`${baseUrl}/v1/multigen/avatars/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'wan-2-2' }),
    });
    assert.equal(wanAvatarRes.status, 201);
    const wanAvatarBody = await wanAvatarRes.json();
    assert.equal(wanAvatarBody.modelId, 'wan-2-2');
    assert.ok(wanAvatarBody.avatarUrl.startsWith('data:image/svg+xml'));
    assert.ok(decodeURIComponent(wanAvatarBody.avatarUrl).includes('WAN-2.2 TURBO'));
    assert.equal(wanAvatarBody.artifact.createdByAgentName, 'Visual Agent');

    const ltxAvatarRes = await fetch(`${baseUrl}/v1/multigen/avatars/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'ltx-2-5' }),
    });
    assert.equal(ltxAvatarRes.status, 201);
    const ltxAvatarBody = await ltxAvatarRes.json();
    assert.equal(ltxAvatarBody.modelId, 'ltx-2-5');
    assert.ok(ltxAvatarBody.avatarUrl.startsWith('data:image/svg+xml'));
    assert.ok(decodeURIComponent(ltxAvatarBody.avatarUrl).includes('LTX-VIDEO 2.5'));
    assert.equal(ltxAvatarBody.artifact.createdByAgentName, 'Visual Agent');

    // 5. MCP Hub JSON-RPC & Endpoint Generator
    const rpcRes = await fetch(`${baseUrl}/v1/mcp/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'rpc-99',
        method: 'resources/read',
        params: { uri: 'system://capabilities' },
      }),
    });
    assert.equal(rpcRes.status, 200);
    const rpcBody = await rpcRes.json();
    assert.ok(rpcBody.result?.contents?.[0]?.text.includes('toolsCount'));

    const badGenRes = await fetch(`${baseUrl}/v1/mcp/endpoints/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'bad-cmd',
        transport: 'stdio',
        targetUrlOrCommand: 'npx foo | cat /etc/passwd',
      }),
    });
    assert.equal(badGenRes.status, 400);

    const okGenRes = await fetch(`${baseUrl}/v1/mcp/endpoints/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'prod-httpx-relay',
        transport: 'httpx_webhook',
        targetUrlOrCommand: 'http://localhost:3000/v1/mcp/rpc',
        authMode: 'bearer',
      }),
    });
    assert.equal(okGenRes.status, 201);
    const okGenBody = await okGenRes.json();
    assert.ok(okGenBody.endpoint.id);
  } finally {
    server.close();
  }
});
