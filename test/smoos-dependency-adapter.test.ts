import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { createSmoosDependencyAdapter } from '../adapters/plos/smoos_dependency_adapter.ts';

const fixtureModulePath = pathToFileURL(path.resolve('test/fixtures/smoos-dependency-fixture.ts')).href;

test('createSmoosDependencyAdapter auto-detects a factory export from a dependency module', async () => {
  const adapter = await createSmoosDependencyAdapter({ moduleName: fixtureModulePath });

  const capability = await adapter.evaluateCapability({ actorId: 'user-1', capability: 'intent:read' });
  assert.equal(capability.allowed, true);

  const events = await adapter.readAllEvents();
  assert.deepEqual(events, []);
});

test('createSmoosDependencyAdapter can use an explicit adapter export name', async () => {
  const adapter = await createSmoosDependencyAdapter({ moduleName: fixtureModulePath, exportName: 'smoosAdapter' });

  const capability = await adapter.evaluateCapability({ actorId: 'user-1', capability: 'intent:read' });
  assert.equal(capability.allowed, true);
});

test('createSmoosDependencyAdapter bridges the installed Smo.OS git dependency', async (t) => {
  const require = createRequire(import.meta.url);

  let packagePath: string | null = null;
  try {
    packagePath = require.resolve('smo-os/package.json');
  } catch {
    packagePath = null;
  }

  if (!packagePath) {
    t.skip('smo-os git dependency is not installed in this environment');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlord-smoos-'));
  const previousCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    const adapter = await createSmoosDependencyAdapter();
    const capability = await adapter.evaluateCapability({ actorId: 'user-1', capability: 'intent:read' });
    assert.equal(capability.allowed, true);

    await adapter.appendEvent({
      id: 'evt-1',
      type: 'overlord.memory/event_written',
      entityId: 'overlord-event',
      payload: { title: 'bridge-to-smo-os' },
      timestamp: Date.now(),
      origin: 'overlord',
      seq: 0,
      seen: {},
    });
    const events = await adapter.readAllEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'overlord.memory/event_written');

    const memoryView = await adapter.getAuthorizedMemoryView({
      userId: 'user-1',
      agentId: 'user-1',
      sessionId: 'session-1',
      capability: 'intent:read',
      scope: ['intent:user-1'],
      reason: 'test installed bridge',
    });
    assert.equal(memoryView.decision, 'allow');

    await adapter.appendAuditRecord({
      ts: new Date().toISOString(),
      runId: 'run-1',
      actorId: 'user-1',
      eventType: 'overlord.intent_received',
      decision: 'info',
      reasonCode: 'INTENT_RECEIVED',
      policyVersion: 'v1',
      details: { source: 'test' },
    });

    const allEvents = await adapter.readAllEvents();
    assert.equal(allEvents.length, 2);
    assert.equal(allEvents[1].type, 'overlord.audit/event_emitted');
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
