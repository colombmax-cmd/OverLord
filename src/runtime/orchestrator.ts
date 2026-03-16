import type { PlosAdapter } from '../../adapters/plos/interface.ts';
import type { ExecutionProvider } from '../adapters/execution/interface.ts';
import { IntentGateway, type RawIntentInput } from '../intent/gateway.ts';
import type { AuditEvent, IntentEnvelope, WorkflowPlan, WorkflowStep } from '../models/core.ts';
import { PlosAccessDeniedError } from '../plos/errors.ts';
import { DefaultPolicyCapabilityGuard, type PolicyCapabilityGuard } from '../policy/guard.ts';

export interface OrchestratorDependencies {
  plos: PlosAdapter;
  executionProvider: ExecutionProvider;
  intentGateway?: IntentGateway;
  policyGuard?: PolicyCapabilityGuard;
}

export interface ProcessIntentResult {
  workflowId: string;
  workflowState: string;
  plan: WorkflowPlan;
}

export class OverlordOrchestrator {
  private readonly deps: OrchestratorDependencies;
  private readonly intentGateway: IntentGateway;
  private readonly policyGuard: PolicyCapabilityGuard;

  constructor(deps: OrchestratorDependencies) {
    this.deps = deps;
    this.intentGateway = deps.intentGateway ?? new IntentGateway();
    this.policyGuard = deps.policyGuard ?? new DefaultPolicyCapabilityGuard();
  }

  async processRawIntent(rawIntent: RawIntentInput): Promise<ProcessIntentResult> {
    const intent = this.intentGateway.normalize(rawIntent);
    return this.processIntent(intent);
  }

  async processIntent(intent: IntentEnvelope): Promise<ProcessIntentResult> {
    await this.emitAudit(intent, 'intent_received', { intentType: intent.intentType });

    const memoryAccess = this.policyGuard.planMemoryAccess(intent);

    try {
      const memoryView = await this.deps.plos.readEvents(memoryAccess.query, memoryAccess.capability);
      await this.emitAudit(intent, 'capability_check', {
        capability: memoryAccess.capability,
        allowed: true,
        reason: 'enforced by MAL/PLOS',
        returnedEvents: memoryView.length,
      });
    } catch (error) {
      if (error instanceof PlosAccessDeniedError) {
        await this.emitAudit(intent, 'capability_denied', {
          capability: error.capability,
          allowed: false,
          reason: error.reason,
        });
      }

      throw error;
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
