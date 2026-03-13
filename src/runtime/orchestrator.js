export class OverlordOrchestrator {
  constructor(deps) {
    this.deps = deps;
  }

  async processIntent(intent) {
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

    return { workflowId, workflowState: state, plan };
  }

  buildPlan(intent) {
    return {
      id: `${intent.id}:plan`,
      timestamp: new Date().toISOString(),
      actorId: intent.actorId,
      correlationId: intent.correlationId,
      schemaVersion: intent.schemaVersion,
      intentId: intent.id,
      steps: [
        {
          id: `${intent.id}:step:1`,
          description: `Handle intent '${intent.intentType}'`,
          capability: 'workflow:submit',
        },
      ],
    };
  }

  async emitAudit(source, kind, details) {
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
