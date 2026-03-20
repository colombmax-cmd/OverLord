import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { EnvironmentSecretResolver } from '../src/secrets/env-resolver.ts';

test('secrets/product: resolver supports product aliases that map to provider env vars', async () => {
  const resolver = new EnvironmentSecretResolver({ OPENAI_API_KEY: 'openai-secret' });
  assert.equal(await resolver.resolve('product:openai_api_key'), 'openai-secret');
});

test('secrets/product: resolver prefers explicit product env values over aliases', async () => {
  const resolver = new EnvironmentSecretResolver({
    OPENAI_API_KEY: 'openai-secret',
    OVERLORD_SECRET_OPENAI_API_KEY: 'product-openai-secret',
  });

  assert.equal(await resolver.resolve('product:openai_api_key'), 'product-openai-secret');
});

test('secrets/product: resolver can read mounted file secrets', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'overlord-secret-'));
  const secretFile = join(tempDir, 'xai.key');

  try {
    await writeFile(secretFile, 'file-secret\n', 'utf8');
    const resolver = new EnvironmentSecretResolver({
      OVERLORD_SECRET_XAI_API_KEY_FILE: secretFile,
    });

    assert.equal(await resolver.resolve('product:xai_api_key'), 'file-secret');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('secrets/product: resolver rejects invalid product refs', async () => {
  const resolver = new EnvironmentSecretResolver({});
  await assert.rejects(() => resolver.resolve('product:not allowed'), /invalid product secret ref/);
});
