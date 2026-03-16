import type { AuditEvent, CapabilityDecision } from '../../src/models/core.ts';
import type { CapabilityCheckRequest, EventQuery, PlosAdapter } from './interface.ts';

export class SmoosAdapter implements PlosAdapter {
  private readonly grantedCapabilities = new Set<string>(['intent:read', 'workflow:submit', 'audit:write']);
  private readonly events: Record<string, unknown>[] = [];
  private readonly audits: AuditEvent[] = [];

  async checkCapability(request: CapabilityCheckRequest): Promise<CapabilityDecision> {
    const allowed = this.grantedCapabilities.has(request.capability);
    return {
      allowed,
      reason: allowed ? 'capability granted by adapter policy' : 'capability missing',
    };
  }

  async readEvents(query: EventQuery, _capability: string): Promise<Record<string, unknown>[]> {
    return this.events.slice(0, query.limit ?? this.events.length);
  }

  async writeEvent(event: Record<string, unknown>, capability: string): Promise<{ ok: true }> {
    const decision = await this.checkCapability({ actorId: 'overlord-runtime', capability });
    if (!decision.allowed) {
      throw new Error(`writeEvent denied: ${decision.reason}`);
    }

    this.events.push(event);
    return { ok: true };
  }

  async publishProjection(
    payload: Record<string, unknown>,
    policy: string,
    capability: string,
  ): Promise<{ projectionRef: string }> {
    const decision = await this.checkCapability({ actorId: 'overlord-runtime', capability });
    if (!decision.allowed) {
      throw new Error(`publishProjection denied: ${decision.reason}`);
    }

    this.events.push({ type: 'projection', policy, payload });
    return { projectionRef: `projection:${this.events.length}` };
  }

  async emitAudit(auditEvent: AuditEvent): Promise<{ ok: true }> {
    this.audits.push(auditEvent);
    return { ok: true };
  }

  getAuditTrail(): AuditEvent[] {
    return [...this.audits];
  }
}
