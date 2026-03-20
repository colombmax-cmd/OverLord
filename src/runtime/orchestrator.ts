import type { PlosAdapter, RuntimeAuditRecord } from '../../adapters/plos/interface.ts';
import type { ExecutionProvider } from '../adapters/execution/interface.ts';
import type { CognitionBackend, ConnectivityProbe } from '../cognition/interface.ts';
import { EnvironmentConnectivityProbe } from '../cognition/connectivity.ts';
import { RoutedCognitionBackend } from '../cognition/router-backend.ts';
import { IntentGateway, type RawIntentInput } from '../intent/gateway.ts';
import type { AuditEvent, IntentEnvelope, WorkflowPlan, WorkflowStep } from '../models/core.ts';
import { PlosAccessDeniedError } from '../plos/errors.ts';
import { DefaultPolicyCapabilityGuard, type PolicyCapabilityGuard } from '../policy/guard.ts';
import { freezePlan } from './plan-freeze.ts';
import { createCognitionDecisionEvent, createCognitionExchangeEvents } from './cognition-events.ts';
import {
  createIntentReceivedEvent,
  createPlanGeneratedEvent,
  createPlanningDecisionEvent,
  createWorkflowStateEvent,
} from './plos-events.ts';

export interface OrchestratorDependencies {
  executionProvider: ExecutionProvider;
  platform: PlosAdapter;
  intentGateway?: IntentGateway;
  policyGuard?: PolicyCapabilityGuard;
  cognitionBackend?: CognitionBackend;
  connectivityProbe?: ConnectivityProbe;
}

export interface ProcessIntentResult {
  outcome: 'workflow_submitted' | 'clarification_required' | 'scope_request' | 'no_action';
  workflowId?: string;
  workflowState?: string;
  plan?: WorkflowPlan;
  clarificationQuestion?: string;
  missingCapability?: string;
  reason?: string;
  cognition?: {
    backendKind: string;
    connectivityStatus: string;
    modelId: string;
    proposalType: string;
    transcriptLength: number;
    routeReason: string;
    requestedPreference: string;
    attemptedBackends: string[];
    fallbackApplied: boolean;
  };
}

export class OverlordOrchestrator {
  private readonly executionProvider: ExecutionProvider;
  private readonly platform: PlosAdapter;
  private readonly intentGateway: IntentGateway;
  private readonly policyGuard: PolicyCapabilityGuard;
  private readonly cognitionBackend: CognitionBackend;
  private readonly connectivityProbe: ConnectivityProbe;

  constructor(deps: OrchestratorDependencies) {
    this.executionProvider = deps.executionProvider;
    this.platform = deps.platform;
    this.intentGateway = deps.intentGateway ?? new IntentGateway();
    this.policyGuard = deps.policyGuard ?? new DefaultPolicyCapabilityGuard();
    this.cognitionBackend = deps.cognitionBackend ?? new RoutedCognitionBackend();
    this.connectivityProbe = deps.connectivityProbe ?? new EnvironmentConnectivityProbe();
  }

  async processRawIntent(rawIntent: RawIntentInput): Promise<ProcessIntentResult> {
    const intent = this.intentGateway.normalize(rawIntent);
    return this.processIntent(intent);
  }

  async processIntent(intent: IntentEnvelope): Promise<ProcessIntentResult> {
    await this.platform.appendEvent(createIntentReceivedEvent(intent));
    await this.emitAudit(intent, 'intent_received', { intentType: intent.intentType });

    const memoryAccess = this.policyGuard.planMemoryAccess(intent);
    const memoryView = await this.platform.getAuthorizedMemoryView(memoryAccess.memoryViewRequest);

    if (memoryView.decision !== 'allow') {
      await this.emitAudit(intent, 'capability_denied', {
        capability: memoryAccess.memoryViewRequest.capability,
        allowed: false,
        reason: memoryView.deniedReason ?? 'memory access denied',
        deniedScopes: memoryView.deniedScopes,
      });

      throw new PlosAccessDeniedError(
        memoryAccess.memoryViewRequest.capability,
        memoryView.deniedReason ?? 'memory access denied',
      );
    }

    await this.emitAudit(intent, 'capability_check', {
      capability: memoryAccess.memoryViewRequest.capability,
      allowed: true,
      reason: 'enforced by MAL/PLOS',
      returnedScopes: memoryView.effectiveScopes,
    });

    const connectivityStatus = this.connectivityProbe.getStatus();
    await this.emitAudit(intent, 'cognition_invoked', {
      availableModels: this.cognitionBackend.getSupportedModels().map((model) => model.modelId),
      connectivityStatus,
      defaultModelId: this.cognitionBackend.defaultModel.modelId,
      requestedPreference: this.readRequestedPreference(intent),
    });

    const cognition = await this.cognitionBackend.decide({ intent, memoryView, connectivityStatus });
    for (const event of createCognitionExchangeEvents(intent.id, cognition.transcript)) {
      await this.platform.appendEvent(event);
    }

    await this.platform.appendEvent(createCognitionDecisionEvent(intent.id, cognition));
    await this.emitAudit(intent, 'cognition_decided', {
      backendKind: cognition.backendKind,
      connectivityStatus: cognition.connectivityStatus,
      proposalType: cognition.proposal.type,
      selectedModelId: cognition.selectedModel.modelId,
      transcriptLength: cognition.transcript.length,
      route: cognition.route,
    });

    const cognitionSummary = {
      backendKind: cognition.backendKind,
      connectivityStatus: cognition.connectivityStatus,
      modelId: cognition.selectedModel.modelId,
      proposalType: cognition.proposal.type,
      transcriptLength: cognition.transcript.length,
      routeReason: cognition.route.reason,
      requestedPreference: cognition.route.requestedPreference,
      attemptedBackends: cognition.route.attemptedBackends,
      fallbackApplied: cognition.route.fallbackApplied,
    };

    const proposal = cognition.proposal;

    if (proposal.type === 'clarification') {
      await this.platform.appendEvent(createPlanningDecisionEvent(intent.id, 'clarification_requested', {
        question: proposal.question,
        modelId: cognition.selectedModel.modelId,
        route: cognition.route,
      }));
      await this.emitAudit(intent, 'clarification_requested', {
        question: proposal.question,
        ...cognitionSummary,
      });
      return {
        outcome: 'clarification_required',
        clarificationQuestion: proposal.question,
        cognition: cognitionSummary,
      };
    }

    if (proposal.type === 'scope_request') {
      await this.platform.appendEvent(createPlanningDecisionEvent(intent.id, 'scope_requested', {
        missingCapability: proposal.missingCapability,
        modelId: cognition.selectedModel.modelId,
        route: cognition.route,
      }));
      await this.emitAudit(intent, 'scope_requested', {
        missingCapability: proposal.missingCapability,
        ...cognitionSummary,
      });
      return {
        outcome: 'scope_request',
        missingCapability: proposal.missingCapability,
        cognition: cognitionSummary,
      };
    }

    if (proposal.type === 'no_action') {
      await this.platform.appendEvent(createPlanningDecisionEvent(intent.id, 'no_action', {
        reason: proposal.reason,
        modelId: cognition.selectedModel.modelId,
        route: cognition.route,
      }));
      await this.emitAudit(intent, 'no_action', {
        reason: proposal.reason,
        ...cognitionSummary,
      });
      return {
        outcome: 'no_action',
        reason: proposal.reason,
        cognition: cognitionSummary,
      };
    }

    const plan = this.buildPlan(intent, proposal.steps);
    await this.platform.appendEvent(createPlanGeneratedEvent(plan));
    await this.emitAudit(intent, 'plan_generated', {
      steps: plan.steps.length,
      planHash: plan.planHash,
      planVersion: plan.planVersion,
      ...cognitionSummary,
    });

    const { workflowId } = await this.executionProvider.submitWorkflow(plan);
    await this.emitAudit(intent, 'workflow_submitted', { workflowId, planHash: plan.planHash, ...cognitionSummary });

    const seenStates = new Set<string>();
    for await (const event of this.executionProvider.subscribeEvents(workflowId)) {
      if (seenStates.has(event.state)) {
        continue;
      }

      seenStates.add(event.state);
      await this.platform.appendEvent(createWorkflowStateEvent(workflowId, event.state, {
        actorId: intent.actorId,
        correlationId: intent.correlationId,
        intentId: intent.id,
        planHash: plan.planHash,
      }));
    }

    const { state } = await this.executionProvider.getWorkflowState(workflowId);
    if (!seenStates.has(state)) {
      await this.platform.appendEvent(createWorkflowStateEvent(workflowId, state, {
        actorId: intent.actorId,
        correlationId: intent.correlationId,
        intentId: intent.id,
        planHash: plan.planHash,
      }));
    }
    await this.emitAudit(intent, 'workflow_completed', { workflowId, state, planHash: plan.planHash, ...cognitionSummary });

    return {
      outcome: 'workflow_submitted',
      workflowId,
      workflowState: state,
      plan,
      cognition: cognitionSummary,
    };
  }

  private readRequestedPreference(intent: IntentEnvelope): string {
    const raw = intent.payload.cognitionPreference;
    if (raw === 'local' || raw === 'remote' || raw === 'auto') {
      return raw;
    }

    return intent.payload.preferRemoteCognition === true ? 'remote' : 'auto';
  }

  private buildPlan(intent: IntentEnvelope, steps: WorkflowStep[]): WorkflowPlan {
    return freezePlan({
      id: `${intent.id}:plan`,
      timestamp: new Date().toISOString(),
      actorId: intent.actorId,
      correlationId: intent.correlationId,
      schemaVersion: intent.schemaVersion,
      intentId: intent.id,
      steps,
    });
  }

  private toRuntimeAuditRecord(
    source: IntentEnvelope,
    kind: AuditEvent['kind'],
    details: Record<string, unknown>,
  ): RuntimeAuditRecord {
    const decision: RuntimeAuditRecord['decision'] = kind === 'capability_denied' ? 'deny' : 'info';
    const reasonCode = kind === 'capability_denied' ? 'DENY_DEFAULT' : kind.toUpperCase();

    return {
      ts: new Date().toISOString(),
      runId: source.correlationId,
      actorId: source.actorId,
      eventType: `overlord.${kind}`,
      decision,
      reasonCode,
      policyVersion: source.schemaVersion,
      prevEventHash: null,
      details,
    };
  }

  private async emitAudit(
    source: IntentEnvelope,
    kind: AuditEvent['kind'],
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.platform.appendAuditRecord(this.toRuntimeAuditRecord(source, kind, details));
  }
}
