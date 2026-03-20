export type {
  PlosAccessGrant,
  PlosAuditPort,
  PlosCapabilityPort,
  PlosCapabilityProbeDecision,
  PlosCapabilityProbeRequest,
  PlosEvent,
  PlosMemoryPort,
  PlosMemoryView,
  PlosMemoryViewRequest,
  PlosPlatformPort,
  PlosStructureView,
  PlosStructureViewRequest,
  RuntimeAuditRecord,
} from '../../src/ports/plos.ts';

import type { PlosPlatformPort } from '../../src/ports/plos.ts';

export interface PlosAdapter extends PlosPlatformPort {}
