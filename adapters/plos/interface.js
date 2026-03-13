/**
 * @typedef {{actorId: string, capability: string, resource?: string}} CapabilityCheckRequest
 * @typedef {{stream: string, limit?: number}} EventQuery
 */

/**
 * @interface
 */
export class PlosAdapter {
  /** @param {CapabilityCheckRequest} _request */
  async checkCapability(_request) {
    throw new Error('not implemented');
  }

  /** @param {EventQuery} _query @param {string} _capability */
  async readEvents(_query, _capability) {
    throw new Error('not implemented');
  }

  /** @param {Record<string, unknown>} _event @param {string} _capability */
  async writeEvent(_event, _capability) {
    throw new Error('not implemented');
  }

  /** @param {Record<string, unknown>} _payload @param {string} _policy @param {string} _capability */
  async publishProjection(_payload, _policy, _capability) {
    throw new Error('not implemented');
  }

  /** @param {Record<string, unknown>} _auditEvent */
  async emitAudit(_auditEvent) {
    throw new Error('not implemented');
  }
}
