const adapter = {
  async checkCapability() {
    return { allowed: true, reason: 'ok' };
  },
  async readEvents() {
    return [];
  },
  async writeEvent() {
    return { ok: true as const };
  },
  async publishProjection() {
    return { projectionRef: 'projection:1' };
  },
  async emitAudit() {
    return { ok: true as const };
  },
};

export function createSmoosAdapter() {
  return adapter;
}

export const smoosAdapter = adapter;
