export class ExecutionProvider {
  async submitWorkflow(_plan) {
    throw new Error('not implemented');
  }

  async getWorkflowState(_workflowId) {
    throw new Error('not implemented');
  }

  async cancelWorkflow(_workflowId, _reason) {
    throw new Error('not implemented');
  }

  async *subscribeEvents(_workflowId) {
    throw new Error('not implemented');
  }
}
