import type { PlosAdapter } from '../../adapters/plos/interface.ts';
import type { ExecutionProvider } from '../adapters/execution/interface.ts';
import type { AuditEvent, IntentEnvelope, WorkflowPlan, WorkflowStep } from '../models/core.ts';

export interface OrchestratorDependencies {
  plos: PlosAdapter;
  executionProvider: ExecutionProvider;
}

export interface ProcessIntentResult {
  workflowId: string;
  workflowState: string;
  plan: WorkflowPlan;
}

export class OverlordOrchestrator {
  private readonly deps: OrchestratorDependencies;

  constructor(deps: OrchestratorDependencies) {
    this.deps = deps;
  }

  async processIntent(intent: IntentEnvelope): Promise<ProcessIntentResult> {
    await this.emitAudit(intent, 'intent_received', { intentType: intent.intentType });

    const capabilityDecision = await this.deps.plos.checkCapability({
      actorId: intent.actorId,
      capability: 'workflow:submit',
      resource: intent.intentType,
    });

    await this.emitAudit(intent, 'capability_check', {
      capability: 'workflow:submit',
      allowed: capabilityDecision.allowed,
      reason: capabilityDecision.reason,
    });

    if (!capabilityDecision.allowed) {
      throw new Error(`intent rejected: ${capabilityDecision.reason}`);
    }

    const plan = this.buildPlan(intent);
    await this.emitAudit(intent, 'plan_generated', { steps: plan.steps.length });

    const { workflowId } = await this.deps.executionProvider.submitWorkflow(plan);
    await this.emitAudit(intent, 'workflow_submitted', { workflowId });

    const { state } = await this.deps.executionProvider.getWorkflowState(workflowId);
    await this.emitAudit(intent, 'workflow_completed', { workflowId, state });

    return {
      workflowId,
      workflowState: state,
      plan,
    };
  }

  private buildPlan(intent: IntentEnvelope): WorkflowPlan {
    const steps: WorkflowStep[] = [
      {
        id: `${intent.id}:step:1`,
        description: `Handle intent '${intent.intentType}'`,
        capability: 'workflow:submit',
      },
    ];

    return {
      id: `${intent.id}:plan`,
      timestamp: new Date().toISOString(),
      actorId: intent.actorId,
      correlationId: intent.correlationId,
      schemaVersion: intent.schemaVersion,
      intentId: intent.id,
      steps,
    };
  }

  private async emitAudit(
    source: IntentEnvelope,
    kind: AuditEvent['kind'],
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.plos.emitAudit({
      id: `${source.id}:audit:${kind}:${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: source.actorId,
      correlationId: source.correlationId,
      schemaVersion: source.schemaVersion,
      kind,
      details,
    });
  }
}
