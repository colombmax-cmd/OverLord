import type { AuditEvent, CapabilityDecision } from '../../src/models/core.ts';

export interface CapabilityCheckRequest {
  actorId: string;
  capability: string;
  resource?: string;
}

export interface EventQuery {
  stream: string;
  limit?: number;
}

export interface PlosAdapter {
  checkCapability(request: CapabilityCheckRequest): Promise<CapabilityDecision>;
  readEvents(query: EventQuery, capability: string): Promise<Record<string, unknown>[]>;
  writeEvent(event: Record<string, unknown>, capability: string): Promise<{ ok: true }>;
  publishProjection(
    payload: Record<string, unknown>,
    policy: string,
    capability: string,
  ): Promise<{ projectionRef: string }>;
  emitAudit(auditEvent: AuditEvent): Promise<{ ok: true }>;
}
