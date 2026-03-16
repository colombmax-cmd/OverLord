export class InMemoryExecutionProvider {
  constructor() {
    this.workflows = new Map();
  }

  async submitWorkflow(plan) {
    const workflowId = `wf-${this.workflows.size + 1}`;
    this.workflows.set(workflowId, { id: workflowId, state: 'completed', plan });
    return { workflowId };
  }

  async getWorkflowState(workflowId) {
    const record = this.workflows.get(workflowId);
    if (!record) {
      throw new Error(`workflow not found: ${workflowId}`);
    }

    return { state: record.state };
  }

  async cancelWorkflow(workflowId) {
    const record = this.workflows.get(workflowId);
    if (!record) {
      throw new Error(`workflow not found: ${workflowId}`);
    }

    record.state = 'cancelled';
    return { ok: true };
  }

  async *subscribeEvents(workflowId) {
    const state = await this.getWorkflowState(workflowId);
    yield { state: state.state, at: new Date().toISOString() };
  }
}
