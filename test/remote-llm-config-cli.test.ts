import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { createDefaultRemoteCognitionBackend } from '../src/cognition/default-remote-backend.ts';
import { readRemoteLlmProviderProfileFromConfig } from '../src/cognition/provider-config.ts';
import { getOverlordConfigPaths, readOverlordUserConfig } from '../src/config/user-config.ts';
import { runRemoteLlmConfigCli } from '../src/cli/remote-llm-config.ts';
import { DefaultSecretResolver } from '../src/secrets/default-resolver.ts';

const execFile = promisify(execFileCallback);

test('remote-llm/config-cli: set command persists provider, model and secret outside env vars', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'overlord-config-cli-'));
  const env = { ...process.env, OVERLORD_CONFIG_DIR: configDir };
  const outputs: string[] = [];
  const errors: string[] = [];

  try {
    const exitCode = await runRemoteLlmConfigCli([
      'set',
      '--provider', 'xai',
      '--model', 'grok-4.20-beta-latest-non-reasoning',
      '--api-key', 'cli-secret-123',
      '--store', 'false',
    ], {
      stdout: (message) => outputs.push(message),
      stderr: (message) => errors.push(message),
    }, env);

    assert.equal(exitCode, 0);
    assert.deepEqual(errors, []);
    assert.equal(outputs.length, 2);

    const config = readOverlordUserConfig(env);
    assert.ok(config?.remoteLlm);
    assert.equal(config?.remoteLlm?.providerId, 'xai');
    assert.equal(config?.remoteLlm?.modelId, 'grok-4.20-beta-latest-non-reasoning');
    assert.equal(config?.remoteLlm?.apiKeySecretRef, 'config:remote_llm_api_key');
    assert.equal(config?.remoteLlm?.store, false);

    const paths = getOverlordConfigPaths(env);
    const secretsRaw = await readFile(paths.secretsFile, 'utf8');
    assert.match(secretsRaw, /"remote_llm_api_key": "cli-secret-123"/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('remote-llm/config-cli: show command prints persisted remote profile without exposing the secret value', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'overlord-config-show-'));
  const env = { ...process.env, OVERLORD_CONFIG_DIR: configDir };
  const outputs: string[] = [];

  try {
    await runRemoteLlmConfigCli([
      'set',
      '--provider', 'openai',
      '--model', 'gpt-4.1-mini',
      '--api-key', 'openai-cli-secret',
    ], {
      stdout: () => {},
      stderr: () => {},
    }, env);

    const exitCode = await runRemoteLlmConfigCli(['show'], {
      stdout: (message) => outputs.push(message),
      stderr: () => {},
    }, env);

    assert.equal(exitCode, 0);
    assert.equal(outputs.length, 1);
    assert.match(outputs[0], /"providerId": "openai"/);
    assert.doesNotMatch(outputs[0], /openai-cli-secret/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('remote-llm/config-cli: default remote backend prefers persisted config and can resolve config secrets', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'overlord-config-default-'));
  const env = { ...process.env, OVERLORD_CONFIG_DIR: configDir };

  try {
    await runRemoteLlmConfigCli([
      'set',
      '--provider', 'xai',
      '--model', 'grok-user-cli-choice',
      '--api-key', 'persisted-config-secret',
      '--base-url', 'https://custom.x.ai/v1/',
      '--store', 'true',
    ], {
      stdout: () => {},
      stderr: () => {},
    }, env);

    const profile = readRemoteLlmProviderProfileFromConfig(readOverlordUserConfig(env));
    assert.ok(profile);
    assert.equal(profile?.providerId, 'xai');
    assert.equal(profile?.modelId, 'grok-user-cli-choice');
    assert.equal(profile?.baseUrl, 'https://custom.x.ai/v1');
    assert.equal(profile?.apiKeySecretRef, 'config:remote_llm_api_key');
    assert.equal(profile?.store, true);

    const secretResolver = new DefaultSecretResolver(env);
    assert.equal(await secretResolver.resolve('config:remote_llm_api_key'), 'persisted-config-secret');

    const backend = createDefaultRemoteCognitionBackend(env);
    assert.equal(backend.kind, 'remote');
    assert.equal(backend.defaultModel.modelId, 'grok-user-cli-choice');
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('remote-llm/config-cli: src/index.ts exposes the remote-llm config entrypoint', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'overlord-config-entrypoint-'));
  const env = { ...process.env, OVERLORD_CONFIG_DIR: configDir };

  try {
    const setResult = await execFile(process.execPath, [
      'src/index.ts',
      'config',
      'remote-llm',
      'set',
      '--provider', 'xai',
      '--model', 'grok-4.20-beta-latest-non-reasoning',
      '--api-key', 'entrypoint-secret',
    ], {
      cwd: process.cwd(),
      env,
    });

    assert.match(setResult.stdout, /Saved remote-LLM config/);

    const showResult = await execFile(process.execPath, [
      'src/index.ts',
      'config',
      'remote-llm',
      'show',
    ], {
      cwd: process.cwd(),
      env,
    });

    assert.match(showResult.stdout, /"providerId": "xai"/);
    assert.doesNotMatch(showResult.stdout, /entrypoint-secret/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});
