import type { EventQuery } from '../../adapters/plos/interface.ts';
import type { IntentEnvelope } from '../models/core.ts';

export interface MemoryAccessRequest {
  capability: string;
  query: EventQuery;
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
    return {
      capability: 'intent:read',
      query: {
        stream: `intent:${intent.actorId}`,
        limit: 50,
      },
    };
  }
}
