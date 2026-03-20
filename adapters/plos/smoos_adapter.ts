import type {
  PlosAccessGrant,
  PlosAdapter,
  PlosCapabilityProbeDecision,
  PlosCapabilityProbeRequest,
  PlosEvent,
  PlosMemoryView,
  PlosMemoryViewRequest,
  PlosStructureView,
  PlosStructureViewRequest,
  RuntimeAuditRecord,
} from './interface.ts';
import { createAuditLogEvent } from '../../src/runtime/plos-events.ts';

export interface SmoosAdapterOptions {
  grantedCapabilities?: string[];
}

export class SmoosAdapter implements PlosAdapter {
  private readonly grantedCapabilities: Set<string>;
  private readonly events: PlosEvent[] = [];
  private readonly audits: RuntimeAuditRecord[] = [];

  constructor(options: SmoosAdapterOptions = {}) {
    this.grantedCapabilities = new Set(options.grantedCapabilities ?? ['intent:read', 'workflow:submit', 'audit:write']);
  }

  async evaluateCapability(request: PlosCapabilityProbeRequest): Promise<PlosCapabilityProbeDecision> {
    const allowed = this.grantedCapabilities.has(request.capability);
    return {
      allowed,
      reason: allowed ? 'capability granted by adapter policy' : 'capability missing',
      capabilityInstanceId: null,
    };
  }

  async getAuthorizedMemoryView(request: PlosMemoryViewRequest, grant = this.createGrant(request)): Promise<PlosMemoryView> {
    const capability = await this.evaluateCapability({
      actorId: request.agentId,
      capability: request.capability,
    });

    if (!capability.allowed || !grant.capabilities.includes(request.capability)) {
      return {
        request,
        decision: 'deny',
        deniedReason: capability.reason,
        grantId: grant.grantId,
        effectiveScopes: [],
        deniedScopes: [...request.scope],
        context: {},
        timestampMs: Date.now(),
      };
    }

    const effectiveScopes = request.scope.filter((scope) => grant.allowedScopes.includes(scope));
    if (effectiveScopes.length === 0) {
      return {
        request,
        decision: 'deny',
        deniedReason: 'no_scope_authorized',
        grantId: grant.grantId,
        effectiveScopes: [],
        deniedScopes: [...request.scope],
        context: {},
        timestampMs: Date.now(),
      };
    }

    const context = Object.fromEntries(
      effectiveScopes.map((scope) => [scope, { events: [...this.events] }]),
    );

    return {
      request,
      decision: 'allow',
      grantId: grant.grantId,
      effectiveScopes,
      deniedScopes: request.scope.filter((scope) => !effectiveScopes.includes(scope)),
      context,
      timestampMs: Date.now(),
    };
  }

  async getStructureView(request: PlosStructureViewRequest): Promise<PlosStructureView> {
    const scopes = (request.scope ?? []).map((scope) => ({ scope }));
    return {
      request,
      scopes,
      timestampMs: Date.now(),
    };
  }

  async appendEvent(event: PlosEvent): Promise<{ ok: true }> {
    this.events.push(event);
    return { ok: true };
  }

  async readAllEvents(): Promise<PlosEvent[]> {
    return [...this.events];
  }

  async appendAuditRecord(record: RuntimeAuditRecord): Promise<{ ok: true }> {
    this.audits.push(record);
    this.events.push(createAuditLogEvent(record));
    return { ok: true };
  }

  getAuditTrail(): RuntimeAuditRecord[] {
    return [...this.audits];
  }

  private createGrant(request: PlosMemoryViewRequest): PlosAccessGrant {
    const now = Date.now();
    return {
      grantId: `grant:${request.agentId}:${request.capability}`,
      agentId: request.agentId,
      sessionId: request.sessionId,
      capabilities: this.grantedCapabilities.has(request.capability) ? [request.capability] : [],
      allowedScopes: this.grantedCapabilities.has(request.capability) ? [...request.scope] : [],
      issuedAtMs: now - 1000,
      expiresAtMs: now + 60_000,
      userConsentRef: 'overlord-local-smoos-adapter',
    };
  }
}
