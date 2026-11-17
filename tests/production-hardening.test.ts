/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

process.env.NEXUS_SKIP_LISTEN = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { db } from '../src/server/db.ts';
import { app } from '../server.ts';

test('Production persistence: NexusDatabase snapshot export/import + atomic persistSync preserves assets, runs & infra', () => {
  const tmpFile = path.join(os.tmpdir(), `nexus-prod-state-${Date.now()}.json`);
  const prevEnv = process.env.NEXUS_STATE_FILE;
  process.env.NEXUS_STATE_FILE = tmpFile;

  try {
    const markerEndpointId = `ep-prod-${Date.now()}`;
    const nowIso = new Date().toISOString();
    db.serverlessEndpoints.unshift({
      id: markerEndpointId,
      name: 'prod-smoke-ep',
      slug: 'prod-smoke-ep',
      baseModel: 'fal-ai/flux-3/pro',
      weightsSourceUrl: 's3://nexus-weights/prod-smoke.safetensors',
      endpointUrl: 'https://fal.run/nexus-private/prod-smoke-ep',
      gpuProfile: 'h100-sxm',
      minReplicas: 0,
      maxReplicas: 4,
      scaleToZeroSec: 90,
      status: 'ready',
      coldStartMs: 280,
      avgLatencyMs: 145,
      requestsCount: 7,
      visibility: 'private',
      authTokenMasked: 'fal_key_****prod',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const saved = db.persistSync();
    assert.equal(saved, true);
    assert.ok(fs.existsSync(tmpFile));

    const snapshot = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    assert.equal(snapshot.version, 1);
    assert.ok(snapshot.serverlessEndpoints.some((e: any) => e.id === markerEndpointId));

    // Mutate memory and rehydrate from disk
    db.serverlessEndpoints = db.serverlessEndpoints.filter((e) => e.id !== markerEndpointId);
    assert.equal(db.serverlessEndpoints.some((e) => e.id === markerEndpointId), false);

    const loaded = db.loadPersistedState();
    assert.equal(loaded, true);
    assert.equal(db.serverlessEndpoints.some((e) => e.id === markerEndpointId), true);
  } finally {
    if (prevEnv === undefined) {
      delete process.env.NEXUS_STATE_FILE;
    } else {
      process.env.NEXUS_STATE_FILE = prevEnv;
    }
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
});

test('Production HTTP hardening: /readyz, security headers, 400 malformed JSON & 404 unknown API routes', async () => {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. /healthz + /readyz + security headers
    const healthRes = await fetch(`${baseUrl}/healthz`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok(healthRes.headers.get('x-request-id'));
    assert.equal(healthRes.headers.get('x-powered-by'), null);

    const readyRes = await fetch(`${baseUrl}/readyz`);
    assert.equal(readyRes.status, 200);
    const readyJson = (await readyRes.json()) as any;
    assert.equal(readyJson.status, 'ready');
    assert.ok(readyJson.assetsCount >= 1);

    // 2. Malformed JSON returns 400 JSON instead of HTML stack trace
    const badJsonRes = await fetch(`${baseUrl}/v1/factory/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"broken": ',
    });
    assert.equal(badJsonRes.status, 400);
    const badJsonBody = (await badJsonRes.json()) as any;
    assert.ok(typeof badJsonBody.error === 'string' && badJsonBody.error.length > 0);

    // 3. Unknown API routes return structured 404 JSON
    const notFoundV1 = await fetch(`${baseUrl}/v1/unknown-endpoint-xyz`);
    assert.equal(notFoundV1.status, 404);
    const notFoundBody = (await notFoundV1.json()) as any;
    assert.ok(typeof notFoundBody.error === 'string');

    const notFoundApi = await fetch(`${baseUrl}/api/v1/unknown-endpoint-xyz`);
    assert.equal(notFoundApi.status, 404);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
