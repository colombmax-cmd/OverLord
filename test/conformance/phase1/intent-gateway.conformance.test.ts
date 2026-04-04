import test from 'node:test';
import assert from 'node:assert/strict';

import { IntentValidationError } from '../../../src/intent/errors.ts';
import { buildConformanceHarness, validRawIntent } from '../shared/fixtures.ts';

test('phase1/intent-gateway: generates correlationId and default schemaVersion when missing', () => {
  const { intentGateway } = buildConformanceHarness();
  const normalized = intentGateway.normalize(validRawIntent({ schemaVersion: undefined, correlationId: undefined }));

  assert.equal(normalized.schemaVersion, 'v1');
  assert.equal(typeof normalized.correlationId, 'string');
  assert.ok(normalized.correlationId.startsWith('corr-'));
});

test('phase1/intent-gateway: generated identifiers are deterministic for identical raw input', () => {
  const { intentGateway } = buildConformanceHarness();
  const rawIntent = validRawIntent({
    schemaVersion: undefined,
    correlationId: undefined,
    id: undefined,
    timestamp: undefined,
  });

  const first = intentGateway.normalize(rawIntent);
  const second = intentGateway.normalize(rawIntent);

  assert.equal(first.id, second.id);
  assert.equal(first.correlationId, second.correlationId);
});

test('phase1/intent-gateway: rejects unsupported schemaVersion', () => {
  const { intentGateway } = buildConformanceHarness();

  assert.throws(
    () => intentGateway.normalize(validRawIntent({ schemaVersion: 'v2' })),
    (error: unknown) => {
      assert.ok(error instanceof IntentValidationError);
      assert.equal(error.code, 'INTENT_INVALID_SCHEMA_VERSION');
      return true;
    },
  );
});

test('phase1/intent-gateway: rejects invalid payload type', () => {
  const { intentGateway } = buildConformanceHarness();

  assert.throws(
    () => intentGateway.normalize(validRawIntent({ payload: 'invalid' })),
    (error: unknown) => {
      assert.ok(error instanceof IntentValidationError);
      assert.equal(error.code, 'INTENT_INVALID_PAYLOAD');
      return true;
    },
  );
});

test('phase1/intent-gateway: orchestrator surfaces validation errors from raw intent path', async () => {
  const { orchestrator } = buildConformanceHarness();

  await assert.rejects(
    async () =>
      orchestrator.processRawIntent({
        actorId: 'u1',
        intentType: '',
        payload: {},
      }),
    (error: unknown) => {
      assert.ok(error instanceof IntentValidationError);
      assert.equal(error.code, 'INTENT_MISSING_FIELD');
      return true;
    },
  );
});
