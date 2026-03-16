import type { AuditEvent, CapabilityDecision } from '../../src/models/core.ts';
import type { CapabilityCheckRequest, EventQuery, PlosAdapter } from './interface.ts';
import { PlosAccessDeniedError } from '../../src/plos/errors.ts';

export interface SmoosAdapterOptions {
  grantedCapabilities?: string[];
}

export class SmoosAdapter implements PlosAdapter {
  private readonly grantedCapabilities: Set<string>;
  private readonly events: Record<string, unknown>[] = [];
  private readonly audits: AuditEvent[] = [];

  constructor(options: SmoosAdapterOptions = {}) {
    this.grantedCapabilities = new Set(options.grantedCapabilities ?? ['intent:read', 'workflow:submit', 'audit:write']);
  }

  async checkCapability(request: CapabilityCheckRequest): Promise<CapabilityDecision> {
    const allowed = this.grantedCapabilities.has(request.capability);
    return {
      allowed,
      reason: allowed ? 'capability granted by adapter policy' : 'capability missing',
    };
  }

  async readEvents(query: EventQuery, capability: string): Promise<Record<string, unknown>[]> {
    const decision = await this.checkCapability({ actorId: 'overlord-runtime', capability });
    if (!decision.allowed) {
      throw new PlosAccessDeniedError(capability, decision.reason);
    }

    return this.events.slice(0, query.limit ?? this.events.length);
  }

  async writeEvent(event: Record<string, unknown>, capability: string): Promise<{ ok: true }> {
    const decision = await this.checkCapability({ actorId: 'overlord-runtime', capability });
    if (!decision.allowed) {
      throw new PlosAccessDeniedError(capability, decision.reason);
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
      throw new PlosAccessDeniedError(capability, decision.reason);
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
