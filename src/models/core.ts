export interface EntityMetadata {
  id: string;
  timestamp: string;
  actorId: string;
  correlationId: string;
  schemaVersion: string;
}

export interface IntentEnvelope extends EntityMetadata {
  intentType: string;
  payload: Record<string, unknown>;
}

export type CapabilityDecision =
  | { allowed: true; reason: string }
  | { allowed: false; reason: string };

export interface WorkflowStep {
  id: string;
  description: string;
  capability: string;
}

export interface WorkflowPlan extends EntityMetadata {
  intentId: string;
  steps: WorkflowStep[];
}

export interface AuditEvent extends EntityMetadata {
  kind:
    | 'intent_received'
    | 'capability_check'
    | 'plan_generated'
    | 'workflow_submitted'
    | 'workflow_completed';
  details: Record<string, unknown>;
}

export type AgentProposal =
  | { type: 'proposal'; steps: WorkflowStep[] }
  | { type: 'clarification'; question: string }
  | { type: 'scope_request'; missingCapability: string }
  | { type: 'no_action'; reason: string };
