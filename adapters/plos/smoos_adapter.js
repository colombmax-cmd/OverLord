export class SmoosAdapter {
  constructor() {
    this.grantedCapabilities = new Set(['intent:read', 'workflow:submit', 'audit:write']);
    this.events = [];
    this.audits = [];
  }

  async checkCapability(request) {
    const allowed = this.grantedCapabilities.has(request.capability);
    return {
      allowed,
      reason: allowed ? 'capability granted by adapter policy' : 'capability missing',
    };
  }

  async readEvents(query) {
    return this.events.slice(0, query.limit ?? this.events.length);
  }

  async writeEvent(event, capability) {
    const decision = await this.checkCapability({ actorId: 'overlord-runtime', capability });
    if (!decision.allowed) {
      throw new Error(`writeEvent denied: ${decision.reason}`);
    }

    this.events.push(event);
    return { ok: true };
  }

  async publishProjection(payload, policy, capability) {
    const decision = await this.checkCapability({ actorId: 'overlord-runtime', capability });
    if (!decision.allowed) {
      throw new Error(`publishProjection denied: ${decision.reason}`);
    }

    this.events.push({ type: 'projection', policy, payload });
    return { projectionRef: `projection:${this.events.length}` };
  }

  async emitAudit(auditEvent) {
    this.audits.push(auditEvent);
    return { ok: true };
  }

  getAuditTrail() {
    return [...this.audits];
  }
}
