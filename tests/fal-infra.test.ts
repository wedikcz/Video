/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

process.env.NEXUS_SKIP_LISTEN = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import {
  buildAgentWorkflowPlan,
  getFalCatalog,
  runFalUnifiedInference,
} from '../src/engines/fal_infrastructure.ts';
import { AgentOrchestrator } from '../src/server/runtime/orchestrator.ts';
import { app } from '../server.ts';

test('Fal Infrastructure unit: catalog 1,542+ models, Inference Engine 10x speedup & fal Agent DAG planning', async () => {
  const catalog = getFalCatalog({});
  assert.ok(catalog.summary.totalModelsCount >= 1500, 'Must expose 1,500+ production models');
  assert.equal(catalog.summary.slaUptime, '99.99%');
  assert.equal(catalog.summary.maxSpeedup, '10×');

  const ids = new Set(catalog.models.map((m) => m.id));
  assert.ok(ids.has('fal-ai/gpt-image-2.6'));
  assert.ok(ids.has('fal-ai/flux-3/pro'));
  assert.ok(ids.has('fal-ai/h3-max'));
  assert.ok(ids.has('fal-ai/seedance-2.5'));
  assert.ok(ids.has('fal-ai/meshy-7.1'));

  const audioSearch = getFalCatalog({ modality: 'audio', query: 'Lyria', limit: 20 });
  assert.ok(audioSearch.models.some((m) => m.id.includes('lyria')));

  const fastRun = await runFalUnifiedInference({
    modelId: 'fal-ai/flux-3/pro',
    prompt: 'Futuristický ateliér v Praze',
    aspectRatio: '16:9',
    numSteps: 20,
    inferenceEngineAccelerated: true,
  });
  const unacceleratedRun = await runFalUnifiedInference({
    modelId: 'fal-ai/flux-3/pro',
    prompt: 'Futuristický ateliér v Praze',
    aspectRatio: '16:9',
    numSteps: 20,
    inferenceEngineAccelerated: false,
  });

  assert.ok(fastRun.speedupFactor >= 8, `Expected ~10x speedup, got ${fastRun.speedupFactor}`);
  assert.ok(fastRun.actualLatencyMs < unacceleratedRun.actualLatencyMs);
  assert.ok(fastRun.outputPreviewSvg?.startsWith('data:image/svg+xml'));
  assert.ok(fastRun.pipelineStages.length >= 3);

  const plan = buildAgentWorkflowPlan(
    'Vytvoř 3D model v Meshy 7.1, natoč video v H3 Max a přidej zvuk'
  );
  assert.ok(plan.steps.length >= 3);
  assert.ok(plan.steps.some((s) => s.modelId === 'fal-ai/meshy-7.1'));
  assert.ok(plan.steps.some((s) => s.modelId === 'fal-ai/h3-max'));
});

test('Fal Infrastructure HTTP API: Model APIs, Serverless, Compute RTX-B300, LoRA, Genmedia CLI & MCP', async () => {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. Overview
    const overviewRes = await fetch(`${baseUrl}/v1/infra/overview`);
    assert.equal(overviewRes.status, 200);
    const overview = await overviewRes.json();
    assert.ok(overview.summary.totalModelsCount >= 1500);
    assert.ok(overview.gpuOfferings.some((g: any) => g.id === 'rtx-4090'));
    assert.ok(overview.gpuOfferings.some((g: any) => g.id === 'h100-sxm'));
    assert.ok(overview.gpuOfferings.some((g: any) => g.id === 'h200-sxm'));
    assert.ok(overview.gpuOfferings.some((g: any) => g.id === 'b200-hgx'));
    assert.ok(overview.gpuOfferings.some((g: any) => g.id === 'b300-ultra'));

    // 2. Unified Model API run (GPT Image 2.6 + Meshy 7.1)
    const imgRunRes = await fetch(`${baseUrl}/v1/infra/models/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: 'fal-ai/gpt-image-2.6',
        prompt: 'Minimalistický produktový snímek chytrých brýlí',
        aspectRatio: '16:9',
        inferenceEngineAccelerated: true,
      }),
    });
    assert.equal(imgRunRes.status, 201);
    const imgRun = await imgRunRes.json();
    assert.equal(imgRun.run.modelId, 'fal-ai/gpt-image-2.6');
    assert.equal(imgRun.run.inferenceEngineAccelerated, true);

    const meshRunRes = await fetch(`${baseUrl}/v1/infra/models/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: 'fal-ai/meshy-7.1',
        prompt: 'Cyberpunk dron pro AR scénu',
      }),
    });
    assert.equal(meshRunRes.status, 201);
    const meshRun = await meshRunRes.json();
    assert.equal(meshRun.run.modality, '3d');

    // 3. Serverless Deploy & Invoke
    const epRes = await fetch(`${baseUrl}/v1/infra/serverless/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test-custom-flux3',
        baseModel: 'fal-ai/flux-3/pro',
        weightsSourceUrl: 's3://weights/test-flux3.safetensors',
        gpuProfile: 'h200-sxm',
        visibility: 'private',
      }),
    });
    assert.equal(epRes.status, 201);
    const epJson = await epRes.json();
    assert.equal(epJson.endpoint.status, 'ready');
    const epId = epJson.endpoint.id;

    const invokeRes = await fetch(`${baseUrl}/v1/infra/serverless/${epId}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Testovací inference vlastních vah' }),
    });
    assert.equal(invokeRes.status, 200);
    const invokeJson = await invokeRes.json();
    assert.equal(invokeJson.endpoint.requestsCount, 1);

    // 4. Compute GPU rent (2x B300 Ultra = 576 GB VRAM) + stop + terminate
    const gpuRes = await fetch(`${baseUrl}/v1/infra/compute/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gpuId: 'b300-ultra',
        gpuCount: 2,
        region: 'eu-central-prague',
        workload: 'lora_training',
      }),
    });
    assert.equal(gpuRes.status, 201);
    const gpuJson = await gpuRes.json();
    assert.equal(gpuJson.instance.totalVramGb, 576);
    assert.equal(gpuJson.instance.status, 'running');

    const patchStopRes = await fetch(`${baseUrl}/v1/infra/compute/instances/${gpuJson.instance.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'stopped' }),
    });
    assert.equal(patchStopRes.status, 200);
    assert.equal((await patchStopRes.json()).instance.status, 'stopped');

    const patchTermRes = await fetch(`${baseUrl}/v1/infra/compute/instances/${gpuJson.instance.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'terminated' }),
    });
    assert.equal(patchTermRes.status, 200);
    assert.equal((await patchTermRes.json()).instance.status, 'terminated');

    // 5. fal Agent Workflow Plan + Execute
    const agentPlanRes = await fetch(`${baseUrl}/v1/infra/agent/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: 'Vygeneruj obrázek ve FLUX 3, převeď do videa v Seedance 2.5 a přidej hudbu',
        execute: true,
      }),
    });
    assert.equal(agentPlanRes.status, 201);
    const agentPlanJson = await agentPlanRes.json();
    assert.equal(agentPlanJson.workflowRun.status, 'completed');
    assert.ok(agentPlanJson.workflowRun.steps.length >= 2);

    // 6. LoRA Training + 1-Click Deploy to Serverless
    const trainRes = await fetch(`${baseUrl}/v1/infra/training/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adapterName: 'Czech Brand Style LoRA',
        baseModelId: 'fal-ai/flux-3/pro',
        triggerWord: 'CZBRAND',
        datasetSource: 's3://datasets/czbrand.zip',
        gpuTier: 'b200-hgx',
        rank: 32,
        steps: 1000,
      }),
    });
    assert.equal(trainRes.status, 201);
    const trainJson = await trainRes.json();
    assert.equal(trainJson.job.status, 'completed');

    const deployTrainRes = await fetch(`${baseUrl}/v1/infra/training/jobs/${trainJson.job.id}/deploy`, {
      method: 'POST',
    });
    assert.equal(deployTrainRes.status, 201);
    const deployTrainJson = await deployTrainRes.json();
    assert.ok(deployTrainJson.endpoint.endpointUrl.includes('fal.run/nexus-private/'));
    assert.equal(deployTrainJson.job.deployedEndpointId, deployTrainJson.endpoint.id);

    // 7. MCP manifest & tool call + Genmedia CLI execution
    const mcpManifestRes = await fetch(`${baseUrl}/v1/infra/mcp/manifest`);
    assert.equal(mcpManifestRes.status, 200);
    const mcpManifest = await mcpManifestRes.json();
    assert.equal(mcpManifest.protocolVersion, '2025-11-05');
    assert.ok(mcpManifest.tools.some((t: any) => t.name === 'fal_generate_media'));

    const mcpCallRes = await fetch(`${baseUrl}/v1/infra/mcp/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'fal_generate_media',
        arguments: {
          modelId: 'fal-ai/h3-max',
          prompt: 'Záběr dronu na Karlově mostě za svítání',
        },
      }),
    });
    assert.equal(mcpCallRes.status, 200);
    const mcpCallJson = await mcpCallRes.json();
    assert.ok(Array.isArray(mcpCallJson.content));
    assert.equal(mcpCallJson.structuredContent.modelId, 'fal-ai/h3-max');

    const cliListRes = await fetch(`${baseUrl}/v1/infra/cli/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'genmedia models list' }),
    });
    assert.equal(cliListRes.status, 200);
    const cliListJson = await cliListRes.json();
    assert.ok(cliListJson.stdout.includes('1542'));

    const cliRentRes = await fetch(`${baseUrl}/v1/infra/cli/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'genmedia compute rent --gpu b200-hgx --count 1' }),
    });
    assert.equal(cliRentRes.status, 200);
    const cliRentJson = await cliRentRes.json();
    assert.equal(cliRentJson.data.gpuId, 'b200-hgx');
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('AgentOrchestrator routes Fal Cloud infrastructure goal to run_fal_agent_workflow', async () => {
  const result = await AgentOrchestrator.executeGoal({
    threadId: 'th-main-001',
    userMessage: 'Spusť FLUX 3 Pro a Meshy 7.1 workflow přes fal Inference Engine',
    dryRun: true,
  });

  assert.ok(result.trace.id);
  assert.ok(
    result.trace.toolCalls.some((tc: { tool: string }) => tc.tool === 'run_fal_agent_workflow'),
    'Expected AgentOrchestrator to invoke run_fal_agent_workflow'
  );
  assert.equal(result.message.suggestions?.length, 6);
});
