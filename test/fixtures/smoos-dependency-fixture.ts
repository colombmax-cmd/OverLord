const adapter = {
  async evaluateCapability() {
    return { allowed: true, reason: 'ok', capabilityInstanceId: null };
  },
  async getAuthorizedMemoryView(request: { scope: string[] }) {
    return {
      request,
      decision: 'allow' as const,
      effectiveScopes: request.scope,
      deniedScopes: [],
      context: {},
      timestampMs: Date.now(),
    };
  },
  async getStructureView(request: { scope?: string[] }) {
    return {
      request,
      scopes: (request.scope ?? []).map((scope) => ({ scope })),
      timestampMs: Date.now(),
    };
  },
  async appendEvent() {
    return { ok: true as const };
  },
  async readAllEvents() {
    return [];
  },
  async appendAuditRecord() {
    return { ok: true as const };
  },
};

export function createSmoosAdapter() {
  return adapter;
}

export const smoosAdapter = adapter;
