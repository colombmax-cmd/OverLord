export interface PlosEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: string;
  entityId: string;
  payload: TPayload;
  timestamp: number;
  origin?: string;
  seq?: number;
  seen?: Record<string, number>;
}

export interface PlosCapabilityConstraintSet {
  [key: string]: unknown;
}

export interface RuntimeCapabilityInstance {
  capabilityInstanceId: string;
  capabilityId: string;
  issuer: string;
  subject: string;
  action: string;
  resource: string;
  constraints?: PlosCapabilityConstraintSet;
  delegable: boolean;
  parentCapabilityInstanceId?: string | null;
  issuedAt: string;
  revoked: boolean;
  meta?: Record<string, unknown>;
}

export interface PlosGrantConstraint {
  maxItems?: number;
  readOnly?: boolean;
}

export interface PlosGrantRenewalState {
  autoRenewalCount: number;
  userRevalidatedAtMs?: number;
}

export interface PlosAccessGrant {
  grantId: string;
  agentId: string;
  sessionId: string;
  capabilities: string[];
  allowedScopes: string[];
  issuedAtMs: number;
  expiresAtMs: number;
  userConsentRef: string;
  constraints?: PlosGrantConstraint;
  renewal?: PlosGrantRenewalState;
}

export interface PlosMemoryViewRequest {
  userId: string;
  agentId: string;
  sessionId: string;
  capability: string;
  scope: string[];
  reason: string;
}

export type PlosMemoryAccessDecision = 'allow' | 'deny';

export interface PlosMemoryView {
  request: PlosMemoryViewRequest;
  decision: PlosMemoryAccessDecision;
  deniedReason?: string;
  renewalDecision?: string;
  grantId?: string;
  effectiveScopes: string[];
  deniedScopes: string[];
  context: Record<string, unknown>;
  timestampMs: number;
}

export interface PlosScopeStructure {
  scope: string;
  namespace?: string;
  category?: string;
  schemaHint?: string;
}

export interface PlosStructureViewRequest {
  requesterId: string;
  reason: string;
  scope?: string[];
}

export interface PlosStructureView {
  request: PlosStructureViewRequest;
  scopes: PlosScopeStructure[];
  timestampMs: number;
}

export interface PlosCapabilityProbeRequest {
  actorId: string;
  capability: string;
  action?: string;
  resource?: string;
}

export type PlosCapabilityProbeDecision =
  | { allowed: true; reason: string; capabilityInstanceId?: string | null }
  | { allowed: false; reason: string; capabilityInstanceId?: string | null };

export interface PlosAuditRequest {
  action?: string;
  resource?: string;
}

export interface PlosAuditDiagnostic {
  constraintFailures?: string[];
  [key: string]: unknown;
}

export interface RuntimeAuditRecord {
  ts: string;
  runId: string;
  actorId: string;
  eventType: string;
  request?: PlosAuditRequest;
  decision: 'allow' | 'deny' | 'info' | 'error';
  reasonCode: string;
  matchedRuleId?: string | null;
  matchedLayer?: 'system' | 'workspace' | 'session' | null;
  capabilityInstanceId?: string | null;
  policyVersion: string;
  compatExceptionUsed?: boolean;
  diagnostic?: PlosAuditDiagnostic;
  prevEventHash?: string | null;
  eventHash?: string;
  details?: Record<string, unknown>;
}

export interface PlosMemoryPort {
  getAuthorizedMemoryView(request: PlosMemoryViewRequest, grant?: PlosAccessGrant): Promise<PlosMemoryView>;
  getStructureView(request: PlosStructureViewRequest): Promise<PlosStructureView>;
  appendEvent(event: PlosEvent): Promise<{ ok: true }>;
  readAllEvents(): Promise<PlosEvent[]>;
}

export interface PlosCapabilityPort {
  evaluateCapability(request: PlosCapabilityProbeRequest): Promise<PlosCapabilityProbeDecision>;
}

export interface PlosAuditPort {
  appendAuditRecord(record: RuntimeAuditRecord): Promise<{ ok: true }>;
}

export interface PlosPlatformPort extends PlosMemoryPort, PlosCapabilityPort, PlosAuditPort {}
