import test from 'node:test';
import assert from 'node:assert/strict';

import { runIntentHealthCli } from '../src/cli/intent-health-cli.ts';

function createIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout(message: string) {
        out.push(message);
      },
      stderr(message: string) {
        err.push(message);
      },
    },
  };
}

test('intent-health-cli: reports missing remote profile and offline fallback guidance', async () => {
  const { out, err, io } = createIo();
  const exitCode = await runIntentHealthCli(io, {
    connectivityStatus: 'offline',
    env: {
      HOME: '/tmp/overlord-health-no-profile',
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(err.length, 0);
  const rendered = out.join('\n');
  assert.match(rendered, /Connectivity: offline/);
  assert.match(rendered, /Remote profile source: none/);
  assert.match(rendered, /Routing guidance:/);
});

test('intent-health-cli: prefers config profile information when available', async () => {
  const { out, err, io } = createIo();
  const exitCode = await runIntentHealthCli(io, {
    connectivityStatus: 'online',
    env: {
      OVERLORD_CONFIG_DIR: '/tmp/overlord-health-config',
      OVERLORD_CONFIG_FILE: '/tmp/overlord-health-config/config.json',
      OVERLORD_SECRETS_FILE: '/tmp/overlord-health-config/secrets.json',
      HOME: '/tmp',
      OVERLORD_REMOTE_LLM_PROVIDER: 'openai',
      OVERLORD_REMOTE_LLM_MODEL: 'gpt-4.1-mini',
      OVERLORD_REMOTE_LLM_API_KEY_REF: 'env:OPENAI_API_KEY',
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(err.length, 0);
  const rendered = out.join('\n');
  assert.match(rendered, /Connectivity: online/);
  assert.match(rendered, /Remote profile source: env \(openai\/gpt-4.1-mini\)/);
});

test('intent-health-cli: reports local runtime settings when enabled', async () => {
  const { out, err, io } = createIo();
  const exitCode = await runIntentHealthCli(io, {
    connectivityStatus: 'offline',
    env: {
      HOME: '/tmp',
      OVERLORD_LOCAL_LLM_ENABLED: '1',
      OVERLORD_LOCAL_LLM_BASE_URL: 'http://127.0.0.1:11434/',
      OVERLORD_LOCAL_LLM_MODEL: 'qwen2.5:1.5b-instruct',
      OVERLORD_LOCAL_LLM_TIMEOUT_MS: '5000',
      OVERLORD_LOCAL_LLM_RETRY_MAX: '2',
    },
    fetchImpl: async () => new Response(JSON.stringify({ models: [] }), { status: 200 }),
  });

  assert.equal(exitCode, 0);
  assert.equal(err.length, 0);
  const rendered = out.join('\n');
  assert.match(rendered, /Local runtime enabled: yes/);
  assert.match(rendered, /Local runtime base URL: http:\/\/127.0.0.1:11434/);
  assert.match(rendered, /Local runtime model: qwen2.5:1.5b-instruct/);
  assert.match(rendered, /Local runtime timeout ms: 5000/);
  assert.match(rendered, /Local runtime retry max: 2/);
  assert.match(rendered, /Local runtime status: reachable/);
});

test('intent-health-cli: local runtime status reports unreachable endpoint reason', async () => {
  const { out, err, io } = createIo();
  const exitCode = await runIntentHealthCli(io, {
    connectivityStatus: 'offline',
    env: {
      HOME: '/tmp',
      OVERLORD_LOCAL_LLM_ENABLED: '1',
      OVERLORD_LOCAL_LLM_BASE_URL: 'http://127.0.0.1:11434/',
      OVERLORD_LOCAL_LLM_MODEL: 'qwen2.5:1.5b-instruct',
      OVERLORD_LOCAL_LLM_TIMEOUT_MS: '100',
    },
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED');
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(err.length, 0);
  const rendered = out.join('\n');
  assert.match(rendered, /Local runtime status: unreachable \(connect ECONNREFUSED\)/);
});

test('intent-health-cli: local runtime probe surfaces nested fetch cause details', async () => {
  const { out, err, io } = createIo();
  const exitCode = await runIntentHealthCli(io, {
    connectivityStatus: 'offline',
    env: {
      HOME: '/tmp',
      OVERLORD_LOCAL_LLM_ENABLED: '1',
      OVERLORD_LOCAL_LLM_BASE_URL: 'http://127.0.0.1:11434/',
      OVERLORD_LOCAL_LLM_MODEL: 'qwen2.5:1.5b-instruct',
      OVERLORD_LOCAL_LLM_TIMEOUT_MS: '100',
    },
    fetchImpl: async () => {
      throw new Error('fetch failed', { cause: new Error('ECONNREFUSED 127.0.0.1:11434') });
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(err.length, 0);
  const rendered = out.join('\n');
  assert.match(rendered, /Local runtime status: unreachable \(ECONNREFUSED 127.0.0.1:11434\)/);
});
