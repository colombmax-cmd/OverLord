import type { EventQuery } from '../../adapters/plos/interface.ts';
import type { IntentEnvelope } from '../models/core.ts';
import type { PlosMemoryViewRequest } from '../ports/plos.ts';

export interface MemoryAccessRequest {
  capability: string;
  query: EventQuery;
  memoryViewRequest: PlosMemoryViewRequest;
}

export interface PolicyCapabilityGuard {
  planMemoryAccess(intent: IntentEnvelope): MemoryAccessRequest;
}

/**
 * Overlord-side policy planner:
 * decides requested scope but does not enforce access.
 * Enforcement is delegated to MAL/PLOS.
 */
export class DefaultPolicyCapabilityGuard implements PolicyCapabilityGuard {
  planMemoryAccess(intent: IntentEnvelope): MemoryAccessRequest {
    const scope = `intent:${intent.actorId}`;

    return {
      capability: 'intent:read',
      query: {
        stream: scope,
        limit: 50,
      },
      memoryViewRequest: {
        userId: intent.actorId,
        agentId: 'overlord-runtime',
        sessionId: intent.correlationId,
        capability: 'intent:read',
        scope: [scope],
        reason: `Process intent ${intent.intentType}`,
      },
    };
  }
}
