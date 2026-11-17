/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

process.env.NEXUS_SKIP_LISTEN = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateAndroidKeystore, verifyKeystoreIntegrity } from '../src/tools/androidKeystoreTool.ts';
import { app } from '../server.ts';
import { AddressInfo } from 'node:net';

test('Android Java Keystore MCP tool: generation & SHA-256 integrity verification', async () => {
  const result = await generateAndroidKeystore({
    alias: 'unit-test-key',
    keyPassword: 'test-key-password-123',
    storePassword: 'test-store-password-123',
    fileName: 'unit-test-release.jks',
    validityYears: 25,
  });

  assert.equal(result.success, true);
  assert.equal(result.alias, 'unit-test-key');
  assert.ok(result.filePath.endsWith('unit-test-release.jks'));
  assert.ok(fs.existsSync(result.filePath));
  assert.equal(result.sha256.length, 64);
  assert.ok(result.sizeBytes > 0);

  // Test integrity verification utility
  const verification = verifyKeystoreIntegrity(result.filePath);
  assert.equal(verification.valid, true);
  assert.equal(verification.sha256, result.sha256);
  assert.ok(verification.sizeBytes > 0);
});

test('Model avatar service & avatar generation endpoint', async () => {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/v1/multigen/avatars/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: 'wan-2-2',
        prompt: 'Unit test cyberpunk avatar',
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.modelId, 'wan-2-2');
    assert.ok(data.avatarUrl);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
