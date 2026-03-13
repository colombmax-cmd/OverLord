import type { WorkflowPlan } from '../../models/core.ts';
import type { ExecutionProvider, WorkflowState } from './interface.ts';

interface WorkflowRecord {
  id: string;
  state: WorkflowState;
  plan: WorkflowPlan;
}

export class InMemoryExecutionProvider implements ExecutionProvider {
  private readonly workflows = new Map<string, WorkflowRecord>();

  async submitWorkflow(plan: WorkflowPlan): Promise<{ workflowId: string }> {
    const workflowId = `wf-${this.workflows.size + 1}`;
    this.workflows.set(workflowId, { id: workflowId, state: 'completed', plan });
    return { workflowId };
  }

  async getWorkflowState(workflowId: string): Promise<{ state: WorkflowState }> {
    const record = this.workflows.get(workflowId);
    if (!record) {
      throw new Error(`workflow not found: ${workflowId}`);
    }

    return { state: record.state };
  }

  async cancelWorkflow(workflowId: string): Promise<{ ok: true }> {
    const record = this.workflows.get(workflowId);
    if (!record) {
      throw new Error(`workflow not found: ${workflowId}`);
    }

    record.state = 'cancelled';
    return { ok: true };
  }

  async *subscribeEvents(workflowId: string): AsyncIterable<{ state: WorkflowState; at: string }> {
    const state = await this.getWorkflowState(workflowId);
    yield { state: state.state, at: new Date().toISOString() };
  }
}
