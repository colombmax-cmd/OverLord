import test from 'node:test';
import assert from 'node:assert/strict';

import { freezePlan } from '../src/runtime/plan-freeze.ts';

test('phase4/freeze: freezePlan is deterministic for identical input and frozenAt', () => {
  const basePlan = {
    id: 'plan-1',
    timestamp: '2026-01-01T00:00:00.000Z',
    actorId: 'user-1',
    correlationId: 'corr-1',
    schemaVersion: 'v1',
    intentId: 'intent-1',
    steps: [
      {
        id: 'intent-1:step:1',
        description: 'Create task',
        capability: 'workflow:submit',
      },
    ],
  };

  const left = freezePlan(basePlan, '2026-01-01T00:00:00.000Z');
  const right = freezePlan(basePlan, '2026-01-01T00:00:00.000Z');

  assert.equal(left.planVersion, 1);
  assert.equal(left.planHash, right.planHash);
  assert.equal(left.frozenAt, right.frozenAt);
});
