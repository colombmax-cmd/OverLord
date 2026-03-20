import type { IntentEnvelope, WorkflowPlan } from '../models/core.ts';
import type { PlosEvent, RuntimeAuditRecord } from '../ports/plos.ts';

function buildEvent(type: string, entityId: string, payload: Record<string, unknown>): PlosEvent {
  const timestamp = Date.now();
  return {
    id: `${type}:${entityId}:${timestamp}`,
    type,
    entityId,
    payload,
    timestamp,
    origin: 'overlord',
    seq: 0,
    seen: {},
  };
}

export function createIntentReceivedEvent(intent: IntentEnvelope): PlosEvent {
  return buildEvent('overlord.intent/received', intent.id, {
    actorId: intent.actorId,
    correlationId: intent.correlationId,
    schemaVersion: intent.schemaVersion,
    intentType: intent.intentType,
    payload: intent.payload,
  });
}

export function createPlanGeneratedEvent(plan: WorkflowPlan): PlosEvent {
  return buildEvent('overlord.plan/generated', plan.id, {
    actorId: plan.actorId,
    correlationId: plan.correlationId,
    schemaVersion: plan.schemaVersion,
    intentId: plan.intentId,
    steps: plan.steps,
    planVersion: plan.planVersion,
    frozenAt: plan.frozenAt,
    planHash: plan.planHash,
  });
}

export function createPlanningDecisionEvent(
  entityId: string,
  decisionType: 'clarification_requested' | 'scope_requested' | 'no_action',
  payload: Record<string, unknown>,
): PlosEvent {
  return buildEvent(`overlord.planning/${decisionType}`, entityId, payload);
}

export function createWorkflowStateEvent(
  workflowId: string,
  state: string,
  context: { actorId: string; correlationId: string; intentId: string; planHash?: string },
): PlosEvent {
  return buildEvent(`overlord.workflow/${state}`, workflowId, {
    actorId: context.actorId,
    correlationId: context.correlationId,
    intentId: context.intentId,
    workflowId,
    state,
    planHash: context.planHash,
  });
}

export function createAuditLogEvent(record: RuntimeAuditRecord): PlosEvent {
  return buildEvent('overlord.audit/event_emitted', record.runId, {
    ts: record.ts,
    runId: record.runId,
    actorId: record.actorId,
    eventType: record.eventType,
    request: record.request,
    decision: record.decision,
    reasonCode: record.reasonCode,
    matchedRuleId: record.matchedRuleId ?? null,
    matchedLayer: record.matchedLayer ?? null,
    capabilityInstanceId: record.capabilityInstanceId ?? null,
    policyVersion: record.policyVersion,
    compatExceptionUsed: record.compatExceptionUsed ?? false,
    diagnostic: record.diagnostic ?? {},
    prevEventHash: record.prevEventHash ?? null,
    eventHash: record.eventHash ?? null,
    details: record.details ?? {},
  });
}
