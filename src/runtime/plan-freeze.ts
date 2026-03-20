import crypto from 'node:crypto';

import type { WorkflowPlan } from '../models/core.ts';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}

export function freezePlan(plan: Omit<WorkflowPlan, 'planVersion' | 'planHash' | 'frozenAt'>, frozenAt = new Date().toISOString()): WorkflowPlan {
  const canonicalPayload = {
    ...plan,
    frozenAt,
    planVersion: 1,
  };
  const planHash = crypto.createHash('sha256').update(stableStringify(canonicalPayload)).digest('hex');

  return {
    ...plan,
    planVersion: 1,
    frozenAt,
    planHash,
  };
}
