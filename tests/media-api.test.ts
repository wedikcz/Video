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
  DEFAULT_MAX_OPEN_RANGE_BYTES,
  MediaRenderer,
  inspectMp4Atoms,
  parseHttpRange,
  slugifyFilename,
  signMediaStreamToken,
  verifyMediaStreamToken,
} from '../src/server/runtime/mediaRenderer.ts';
import { AgentOrchestrator } from '../src/server/runtime/orchestrator.ts';
import { SmartVideoOrchestrator } from '../src/services/SmartVideoOrchestrator.ts';
import { db } from '../src/server/db.ts';
import { app } from '../server.ts';

test('MediaRenderer helpers: parseHttpRange (incl. open-ended cap), slugifyFilename & HMAC signatures', () => {
  assert.equal(parseHttpRange(undefined, 1000), null);
  assert.deepEqual(parseHttpRange('bytes=0-511', 1000), { start: 0, end: 511, valid: true });
  assert.deepEqual(parseHttpRange('bytes=500-', 1000), { start: 500, end: 999, valid: true });
  // Open-ended chunk cap enforcement on large files
  assert.deepEqual(parseHttpRange('bytes=0-', 10_000_000, DEFAULT_MAX_OPEN_RANGE_BYTES), {
    start: 0,
    end: DEFAULT_MAX_OPEN_RANGE_BYTES - 1,
    valid: true,
  });
  assert.deepEqual(parseHttpRange('bytes=-200', 1000), { start: 800, end: 999, valid: true });
  assert.deepEqual(parseHttpRange('bytes=1200-1500', 1000), { start: 0, end: 999, valid: false });

  assert.equal(slugifyFilename('5 AI triků pro YouTube Shorts!'), '5-ai-triku-pro-youtube-shorts');

  const signed = signMediaStreamToken('asset-test-123', 60_000);
  assert.equal(verifyMediaStreamToken('asset-test-123', String(signed.expires), signed.signature).valid, true);
  assert.equal(verifyMediaStreamToken('asset-other', String(signed.expires), signed.signature).valid, false);
  assert.equal(verifyMediaStreamToken('asset-test-123', String(Date.now() - 1000), signed.signature).valid, false);
});

test('MediaRenderer: renders real playable H.264/AAC MP4 via ffmpeg + JPEG poster and supports dryRun reuse', async () => {
  const liveArtifact = await MediaRenderer.renderVideoMp4({
    assetId: 'asset-unit-live-1',
    threadId: 'th-unit-test',
    title: 'Testovací H.264 MP4 Video',
    format: '9:16',
    durationSec: 3,
    dryRun: false,
  });

  assert.equal(liveArtifact.renderedWithFfmpeg, true, 'FFmpeg must render real MP4 without falling back to stub');
  assert.equal(liveArtifact.faststartVerified, true, 'FFmpeg -movflags +faststart must place moov atom before mdat');
  assert.equal(liveArtifact.mimeType, 'video/mp4');
  assert.equal(liveArtifact.resolution, '720x1280');
  assert.ok(liveArtifact.sizeBytes > 10000, `Expected real MP4 >10KB, got ${liveArtifact.sizeBytes}`);
  assert.equal(liveArtifact.sha256.length, 64);
  assert.ok(fs.existsSync(liveArtifact.filePath));
  assert.ok(fs.existsSync(liveArtifact.posterPath), 'Poster JPEG should be extracted alongside MP4');

  const atoms = inspectMp4Atoms(liveArtifact.filePath);
  assert.equal(atoms.valid, true);
  assert.equal(atoms.moovBeforeMdat, true, `Expected moov before mdat, got atoms=${atoms.atoms.join(',')}`);

  const remuxCheck = await MediaRenderer.ensureFaststartMp4(liveArtifact.filePath, liveArtifact.filePath, true);
  assert.equal(remuxCheck.faststartVerified, true);
  assert.equal(remuxCheck.remuxed, true);
  assert.ok(remuxCheck.atoms.includes('moov'));
  assert.equal(MediaRenderer.computeFileChecksum(liveArtifact.filePath).sha256.length, 64);

  const dryRunArtifact = await MediaRenderer.renderVideoMp4({
    assetId: 'asset-unit-dry-1',
    threadId: 'th-unit-test',
    title: 'Dry Run MP4 Test',
    format: '9:16',
    durationSec: 3,
    dryRun: true,
  });
  assert.ok(dryRunArtifact.sizeBytes > 10000);
  assert.ok(fs.existsSync(dryRunArtifact.filePath));
});

test('AgentOrchestrator: executes MP4 video render goal and returns video assets + 6 suggestions', async () => {
  const result = await AgentOrchestrator.executeGoal({
    threadId: 'th-main-001',
    userMessage: 'Spusť MoviePy render do MP4 pro téma AI automatizace',
    dryRun: false,
  });

  assert.equal(result.message.suggestions?.length, 6);
  assert.ok(result.message.generatedAssets && result.message.generatedAssets.length >= 1);
  const video = result.message.generatedAssets[0];
  assert.equal(video.line, 'video');
  assert.equal(video.status, 'ready');
  assert.ok(video.streamUrl?.startsWith('/api/v1/assets/'));
  assert.ok(video.downloadUrl?.startsWith('/api/v1/assets/'));
  assert.ok((video.sizeBytes || 0) > 10000);
});

test('HTTP Media Vault, Range Stream, Poster, Signed URL, 202 Pending & SSE Health API', async () => {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. Render a fresh MP4 via API
    const renderRes = await fetch(`${baseUrl}/api/v1/assets/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'API Test MP4 Render',
        format: '16:9',
        durationSec: 3,
      }),
    });
    assert.equal(renderRes.status, 201);
    const renderJson = await renderRes.json();
    assert.equal(renderJson.renderedWithFfmpeg, true);
    const asset = renderJson.asset;
    assert.ok(asset.id);
    assert.equal(asset.resolution, '1280x720');
    assert.ok(asset.sizeBytes > 10000);

    // 2. List & detail (with posterUrl + signedStreamUrl)
    const listRes = await fetch(`${baseUrl}/api/v1/assets?line=video`);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.ok(listJson.assets.some((a: any) => a.id === asset.id));

    const detailRes = await fetch(`${baseUrl}/api/v1/assets/${asset.id}`);
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.equal(detailJson.id, asset.id);
    assert.ok(detailJson.posterUrl.includes('format=poster'));
    assert.ok(detailJson.signedStreamUrl.includes('signature='));

    // 3. HEAD pre-check on /stream
    const headRes = await fetch(`${baseUrl}/api/v1/assets/${asset.id}/stream`, { method: 'HEAD' });
    assert.equal(headRes.status, 200);
    assert.equal(headRes.headers.get('content-type'), 'video/mp4');
    assert.equal(headRes.headers.get('accept-ranges'), 'bytes');
    assert.equal(Number(headRes.headers.get('content-length')), asset.sizeBytes);
    const exposeHeaders = headRes.headers.get('access-control-expose-headers') || '';
    assert.ok(exposeHeaders.includes('Content-Range'));
    assert.ok(exposeHeaders.includes('Accept-Ranges'));
    const etag = headRes.headers.get('etag');
    assert.ok(etag);

    // 4. Conditional ETag caching (304 Not Modified)
    const notModRes = await fetch(`${baseUrl}/api/v1/assets/${asset.id}/stream`, {
      headers: { 'If-None-Match': etag! },
    });
    assert.equal(notModRes.status, 304);

    // 5. Full stream (200 OK) + compression bypass header
    const fullStreamRes = await fetch(`${baseUrl}/api/v1/assets/${asset.id}/stream`);
    assert.equal(fullStreamRes.status, 200);
    assert.equal(fullStreamRes.headers.get('content-encoding'), 'identity');
    const fullBuf = Buffer.from(await fullStreamRes.arrayBuffer());
    assert.equal(fullBuf.byteLength, asset.sizeBytes);

    // 6. Byte-range stream (206 Partial Content) + If-Range match
    const rangeRes = await fetch(`${baseUrl}/api/v1/assets/${asset.id}/stream`, {
      headers: { Range: 'bytes=0-511', 'If-Range': etag! },
    });
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('content-type'), 'video/mp4');
    assert.equal(rangeRes.headers.get('content-range'), `bytes 0-511/${asset.sizeBytes}`);
    const rangeBuf = Buffer.from(await rangeRes.arrayBuffer());
    assert.equal(rangeBuf.byteLength, 512);

    // 7. Out-of-bounds range -> 416 Range Not Satisfiable
    const badRangeRes = await fetch(`${baseUrl}/api/v1/assets/${asset.id}/stream`, {
      headers: { Range: `bytes=${asset.sizeBytes + 500}-${asset.sizeBytes + 900}` },
    });
    assert.equal(badRangeRes.status, 416);
    assert.equal(badRangeRes.headers.get('content-range'), `bytes */${asset.sizeBytes}`);

    // 8. Poster image (?format=poster)
    const posterRes = await fetch(`${baseUrl}${detailJson.posterUrl}`);
    assert.equal(posterRes.status, 200);
    assert.equal(posterRes.headers.get('content-type'), 'image/jpeg');
    const posterBuf = Buffer.from(await posterRes.arrayBuffer());
    assert.ok(posterBuf.byteLength > 500, 'Poster JPEG should be non-empty');

    // 9. Stream download override (?download=1) + signed stream auth (200 valid / 403 invalid)
    const dlOverrideRes = await fetch(`${baseUrl}/api/v1/assets/${asset.id}/stream?download=1`);
    assert.equal(dlOverrideRes.status, 200);
    assert.equal(dlOverrideRes.headers.get('cache-control'), 'no-store');
    assert.ok((dlOverrideRes.headers.get('content-disposition') || '').includes('attachment;'));

    const signedOkRes = await fetch(`${baseUrl}${detailJson.signedStreamUrl}`);
    assert.equal(signedOkRes.status, 200);
    const signedBadRes = await fetch(
      `${baseUrl}/api/v1/assets/${asset.id}/stream?expires=${Date.now() + 60000}&signature=deadbeef`
    );
    assert.equal(signedBadRes.status, 403);

    // 10. Dedicated /download endpoint
    const dlRes = await fetch(`${baseUrl}/api/v1/assets/${asset.id}/download`);
    assert.equal(dlRes.status, 200);
    assert.equal(dlRes.headers.get('content-type'), 'video/mp4');
    assert.equal(dlRes.headers.get('cache-control'), 'no-store');
    const cd = dlRes.headers.get('content-disposition') || '';
    assert.ok(cd.includes('attachment;') && cd.includes('.mp4'));
    const dlBuf = Buffer.from(await dlRes.arrayBuffer());
    assert.equal(dlBuf.byteLength, asset.sizeBytes);

    // 11. Generating asset state -> 202 Accepted + Retry-After: 2 (never streams partial file)
    const pendingId = 'asset-rendering-test';
    db.factoryAssets.unshift({
      id: pendingId,
      threadId: 'th-main-001',
      line: 'video',
      title: 'Právě renderovaný MP4 klip',
      body: 'Probíhá render',
      meta: 'Rendering...',
      tags: ['MP4'],
      status: 'rendering',
      createdAt: new Date().toISOString(),
    });
    const pendingStreamRes = await fetch(`${baseUrl}/api/v1/assets/${pendingId}/stream`);
    assert.equal(pendingStreamRes.status, 202);
    assert.equal(pendingStreamRes.headers.get('retry-after'), '2');
    const pendingDlRes = await fetch(`${baseUrl}/api/v1/assets/${pendingId}/download`);
    assert.equal(pendingDlRes.status, 202);
    assert.equal(pendingDlRes.headers.get('retry-after'), '2');

    // 12. SSE System Health stream
    const controller = new AbortController();
    const sseRes = await fetch(`${baseUrl}/v1/system/health/stream`, {
      signal: controller.signal,
    });
    assert.equal(sseRes.status, 200);
    assert.ok(sseRes.headers.get('content-type')?.includes('text/event-stream'));

    const reader = sseRes.body!.getReader();
    const { value } = await reader.read();
    const chunkText = new TextDecoder().decode(value);
    controller.abort();
    assert.ok(chunkText.includes('event: health'));
    assert.ok(chunkText.includes('cpuUsagePercent'));
    assert.ok(chunkText.includes('mediaVaultCount'));
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Async 202 Accepted Worker, /status Polling, +faststart & SmartVideoOrchestrator E2E', async () => {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const orchestrator = new SmartVideoOrchestrator(baseUrl);

    // 1. Direct async generation -> 202 Accepted + Retry-After + /status polling -> ready
    const asyncGenRes = await fetch(`${baseUrl}/v1/factory/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line: 'video',
        topic: 'Asynchronní FFmpeg +faststart Test',
        format: '9:16',
        async: true,
      }),
    });
    assert.equal(asyncGenRes.status, 202);
    assert.equal(asyncGenRes.headers.get('retry-after'), '1');
    const asyncGenJson = await asyncGenRes.json();
    assert.equal(asyncGenJson.statusCode, 202);
    const asyncAssetId = asyncGenJson.asset.id;
    assert.ok(asyncAssetId);

    // Immediately verify /stream blocks partial reads with 202 while generating
    const earlyStreamRes = await fetch(`${baseUrl}/api/v1/assets/${asyncAssetId}/stream`);
    assert.equal(earlyStreamRes.status, 202);

    // Poll /status via SmartVideoOrchestrator until ready
    const progressUpdates: Array<{ httpStatus: number; stage: string; percent: number }> = [];
    const polled = await orchestrator.pollAssetUntilReady(asyncAssetId, {
      pollIntervalMs: 250,
      maxPolls: 40,
      onProgress: (u) => {
        progressUpdates.push({
          httpStatus: u.httpStatus,
          stage: u.progressStage,
          percent: u.progressPercent,
        });
      },
    });
    assert.equal(polled.asset.status, 'ready');
    assert.equal(polled.asset.faststartVerified, true);
    assert.ok((polled.asset.sizeBytes || 0) > 10000);
    assert.ok(polled.asset.sha256 && polled.asset.sha256.length === 64);
    assert.ok(progressUpdates.some((p) => p.httpStatus === 200 && p.stage === 'ready'));

    // 2. SmartVideoOrchestrator trend analysis & automated MoviePy + FFmpeg trigger
    const trendAnalysis = await orchestrator.analyzeTrendingTopics();
    assert.ok(trendAnalysis.selectedTrend.id);
    assert.ok(trendAnalysis.trends.length >= 1);
    assert.ok(trendAnalysis.recommendedTemplateId);

    let accepted202Fired = false;
    const trendProgress: number[] = [];
    const smartResult = await orchestrator.analyzeTrendsAndTriggerMoviePy(
      { trendId: trendAnalysis.selectedTrend.id },
      {
        pollIntervalMs: 250,
        maxPolls: 45,
        onAccepted202: () => {
          accepted202Fired = true;
        },
        onProgress: (u) => {
          trendProgress.push(u.httpStatus);
        },
      }
    );

    assert.equal(accepted202Fired, true, 'SmartVideoOrchestrator must handle HTTP 202 Accepted');
    assert.equal(smartResult.received202Accepted, true);
    assert.ok(smartResult.pollCount >= 1);
    assert.equal(smartResult.asset.status, 'ready');
    assert.equal(smartResult.asset.faststartVerified, true);
    assert.ok(trendProgress.includes(202));
    assert.ok(trendProgress.includes(200));
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('OpenGen AI Multi-Model Suite: models catalog, prompt magic, credit top-up & Veo 3.1 generation', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const orchestrator = new SmartVideoOrchestrator(baseUrl);

  try {
    // 1. Models catalog & credits query
    const catalog = await orchestrator.getOpenGenModels();
    assert.ok(Array.isArray(catalog.models));
    assert.ok(catalog.models.length >= 10);
    assert.ok(catalog.models.some((m) => m.id === 'veo-3-1'));
    assert.ok(catalog.models.some((m) => m.id === 'kling-o3'));
    assert.ok(catalog.models.some((m) => m.id === 'minimax-hailuo-2-3'));
    assert.ok(catalog.models.some((m) => m.id === 'runway-gen-4-5'));
    assert.ok(catalog.credits.available >= 0);
    assert.ok(Array.isArray(catalog.supportedCameras));
    assert.ok(catalog.supportedCameras.length >= 9);

    // 2. Prompt Magic cinematic expansion
    const enhanced = await orchestrator.enhancePrompt('AI robot in Prague coffee shop', {
      modelId: 'veo-3-1',
      camera: 'orbit_360',
    });
    assert.ok(enhanced.enhancedPrompt.includes('anamorphic'));
    assert.ok(enhanced.enhancedPrompt.includes('Arri Alexa'));
    assert.ok(enhanced.enhancedPrompt.includes('orbit'));

    // 3. Credit Top-Up
    const prevAvailable = catalog.credits.available;
    const topupRes = await orchestrator.topUpCredits('creator');
    assert.equal(topupRes.success, true);
    assert.equal(topupRes.addedCredits, 500);
    assert.equal(topupRes.credits.available, prevAvailable + 500);

    // 4. OpenGen Video Generation (Async 202 -> FastStart Ready)
    const genResult = await orchestrator.generateOpenGenVideo(
      {
        modelId: 'veo-3-1',
        mode: 'text_to_video',
        prompt: 'Futuristická Praha v roce 2050 s létajícími vozy',
        aspectRatio: '9:16',
        durationSec: 6,
        cameraMotion: 'orbit_360',
        motionIntensity: 8,
        fps: 30,
        qualityTier: '1080p',
        promptMagic: true,
      },
      {
        pollIntervalMs: 250,
        maxPolls: 40,
      }
    );

    assert.equal(genResult.received202Accepted, true);
    assert.equal(genResult.asset.status, 'ready');
    assert.equal(genResult.asset.faststartVerified, true);
    assert.ok(genResult.asset.tags && genResult.asset.tags.includes('OpenGen'));
    assert.ok(genResult.asset.tags && genResult.asset.tags.includes('Google Veo 3.1'));
    assert.ok((genResult.asset.sizeBytes || 0) > 10000);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Transient preview generation & Hover-to-preview API endpoint (/api/v1/assets/:asset_id/preview)', async () => {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. Direct unit test on MediaRenderer.ensurePreviewSnippet
    const snippetArtifact = await MediaRenderer.ensurePreviewSnippet({
      assetId: 'asset-preview-unit-1',
      threadId: 'th-preview-test',
      durationSec: 2.5,
    });

    assert.ok(snippetArtifact.previewPath.endsWith('.preview.mp4'));
    assert.ok(fs.existsSync(snippetArtifact.previewPath));
    assert.ok(snippetArtifact.sizeBytes > 512, `Expected preview snippet >512B, got ${snippetArtifact.sizeBytes}`);
    assert.equal(snippetArtifact.previewUrl, '/api/v1/assets/asset-preview-unit-1/preview');
    assert.equal(snippetArtifact.faststartVerified, true, 'Preview snippet must be faststart streamable');

    // Second call should return cached artifact
    const cachedArtifact = await MediaRenderer.ensurePreviewSnippet({
      assetId: 'asset-preview-unit-1',
      threadId: 'th-preview-test',
      durationSec: 2.5,
    });
    assert.equal(cachedArtifact.cached, true);

    // 2. HTTP POST /api/v1/assets/:asset_id/preview (explicit trigger)
    const postRes = await fetch(`${baseUrl}/api/v1/assets/asset-preview-unit-1/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: 2.5 }),
    });
    assert.ok(postRes.status === 200 || postRes.status === 201);
    const postJson = await postRes.json();
    assert.equal(postJson.status, 'ready');
    assert.equal(postJson.assetId, 'asset-preview-unit-1');
    assert.ok(postJson.previewUrl.includes('/preview'));
    assert.ok(postJson.sizeBytes > 512);

    // 3. HTTP GET with format=json
    const jsonRes = await fetch(`${baseUrl}/api/v1/assets/asset-preview-unit-1/preview?format=json`);
    assert.equal(jsonRes.status, 200);
    const getJson = await jsonRes.json();
    assert.equal(getJson.status, 'ready');
    assert.equal(getJson.assetId, 'asset-preview-unit-1');

    // 4. HTTP HEAD pre-check on /preview
    const headRes = await fetch(`${baseUrl}/api/v1/assets/asset-preview-unit-1/preview`, { method: 'HEAD' });
    assert.equal(headRes.status, 200);
    assert.equal(headRes.headers.get('content-type'), 'video/mp4');
    assert.equal(headRes.headers.get('accept-ranges'), 'bytes');
    assert.equal(headRes.headers.get('x-preview-transient'), '1');
    assert.ok(Number(headRes.headers.get('content-length')) > 512);

    // 5. HTTP GET binary streaming of preview snippet via /api/v1/assets/.../preview and /v1/preview/...
    const streamRes = await fetch(`${baseUrl}/api/v1/assets/asset-preview-unit-1/preview`);
    assert.equal(streamRes.status, 200);
    assert.equal(streamRes.headers.get('content-type'), 'video/mp4');
    const streamBuffer = await streamRes.arrayBuffer();
    assert.ok(streamBuffer.byteLength > 512);

    const v1PreviewRes = await fetch(`${baseUrl}/v1/preview/asset-preview-unit-1`);
    assert.equal(v1PreviewRes.status, 200);
    assert.equal(v1PreviewRes.headers.get('content-type'), 'video/mp4');
    assert.equal(v1PreviewRes.headers.get('x-preview-transient'), '1');

    // 6. HTTP Range partial content (206)
    const rangeRes = await fetch(`${baseUrl}/api/v1/assets/asset-preview-unit-1/preview`, {
      headers: { Range: 'bytes=0-500' },
    });
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('content-range')?.startsWith('bytes 0-500/'), true);
    assert.equal(Number(rangeRes.headers.get('content-length')), 501);

    // 7. Verify asset list responses include previewUrl
    const listRes = await fetch(`${baseUrl}/api/v1/assets?line=video`);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.ok(listJson.assets.some((a: any) => typeof a.previewUrl === 'string'));
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
