import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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


test('remote-llm/config-cli: default config paths respect HOME when OVERLORD_CONFIG_DIR is unset', async () => {
  const fakeHome = await mkdtemp(join(tmpdir(), 'overlord-home-'));

  try {
    const paths = getOverlordConfigPaths({ ...process.env, HOME: fakeHome, OVERLORD_CONFIG_DIR: undefined });
    assert.equal(paths.configDir, join(fakeHome, '.config', 'overlord'));
    assert.equal(paths.configFile, join(fakeHome, '.config', 'overlord', 'config.json'));
    assert.equal(paths.secretsFile, join(fakeHome, '.config', 'overlord', 'secrets.json'));
  } finally {
    await rm(fakeHome, { recursive: true, force: true });
  }
});

test('remote-llm/config-cli: rewriting persisted secrets re-applies restrictive file permissions', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'overlord-config-perms-'));
  const env = { ...process.env, OVERLORD_CONFIG_DIR: configDir };

  try {
    await runRemoteLlmConfigCli([
      'set',
      '--provider', 'xai',
      '--model', 'grok-4.20-beta-latest-non-reasoning',
      '--api-key', 'first-secret',
    ], {
      stdout: () => {},
      stderr: () => {},
    }, env);

    const paths = getOverlordConfigPaths(env);
    await chmod(paths.secretsFile, 0o644);

    await runRemoteLlmConfigCli([
      'set',
      '--provider', 'xai',
      '--model', 'grok-4.20-beta-latest-non-reasoning',
      '--api-key', 'second-secret',
    ], {
      stdout: () => {},
      stderr: () => {},
    }, env);

    const secretStats = await stat(paths.secretsFile);
    assert.equal(secretStats.mode & 0o777, 0o600);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('remote-llm/config-cli: missing required flags return usage instead of throwing', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'overlord-config-flags-'));
  const env = { ...process.env, OVERLORD_CONFIG_DIR: configDir };
  const outputs: string[] = [];
  const errors: string[] = [];

  try {
    const exitCode = await runRemoteLlmConfigCli([
      'set',
      '--provider', 'xai',
      '--api-key', 'missing-model',
    ], {
      stdout: (message) => outputs.push(message),
      stderr: (message) => errors.push(message),
    }, env);

    assert.equal(exitCode, 1);
    assert.deepEqual(outputs, []);
    assert.match(errors[0] ?? '', /missing required flag --model/);
    assert.match(errors[1] ?? '', /Usage:/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});


test('remote-llm/config-cli: invalid --store values are rejected explicitly', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'overlord-config-invalid-store-'));
  const env = { ...process.env, OVERLORD_CONFIG_DIR: configDir };
  const errors: string[] = [];

  try {
    const exitCode = await runRemoteLlmConfigCli([
      'set',
      '--provider', 'xai',
      '--model', 'grok-4.20-beta-latest-non-reasoning',
      '--api-key', 'cli-secret-123',
      '--store', 'maybe',
    ], {
      stdout: () => {},
      stderr: (message) => errors.push(message),
    }, env);

    assert.equal(exitCode, 1);
    assert.match(errors[0] ?? '', /invalid --store value: maybe/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('remote-llm/config-cli: invalid base URLs are rejected explicitly', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'overlord-config-invalid-url-'));
  const env = { ...process.env, OVERLORD_CONFIG_DIR: configDir };
  const errors: string[] = [];

  try {
    const exitCode = await runRemoteLlmConfigCli([
      'set',
      '--provider', 'xai',
      '--model', 'grok-4.20-beta-latest-non-reasoning',
      '--api-key', 'cli-secret-123',
      '--base-url', 'not-a-url',
    ], {
      stdout: () => {},
      stderr: (message) => errors.push(message),
    }, env);

    assert.equal(exitCode, 1);
    assert.match(errors[0] ?? '', /remote-LLM baseUrl must be a valid absolute URL/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('remote-llm/config-cli: show reports malformed persisted config cleanly', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'overlord-config-malformed-show-'));
  const env = { ...process.env, OVERLORD_CONFIG_DIR: configDir };
  const errors: string[] = [];

  try {
    const paths = getOverlordConfigPaths(env);
    await writeFile(paths.configFile, JSON.stringify({
      remoteLlm: {
        providerId: 'xai',
        modelId: 'grok-4.20-beta-latest-non-reasoning',
        baseUrl: 'https://api.x.ai/v1',
        store: true,
      },
    }, null, 2));

    const exitCode = await runRemoteLlmConfigCli(['show'], {
      stdout: () => {},
      stderr: (message) => errors.push(message),
    }, env);

    assert.equal(exitCode, 1);
    assert.match(errors[0] ?? '', /invalid persisted remote-LLM config: remoteLlm.apiKeySecretRef must be a non-empty string/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});
