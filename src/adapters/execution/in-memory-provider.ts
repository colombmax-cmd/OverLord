import type { WorkflowPlan } from '../../models/core.ts';
import type { ExecutionProvider, WorkflowState } from './interface.ts';

interface WorkflowEvent {
  state: WorkflowState;
  at: string;
}

interface WorkflowRecord {
  id: string;
  state: WorkflowState;
  plan: WorkflowPlan;
  events: WorkflowEvent[];
}

export class InMemoryExecutionProvider implements ExecutionProvider {
  private readonly workflows = new Map<string, WorkflowRecord>();

  async submitWorkflow(plan: WorkflowPlan): Promise<{ workflowId: string }> {
    const workflowId = `wf-${this.workflows.size + 1}`;
    const events: WorkflowEvent[] = [
      { state: 'submitted', at: new Date().toISOString() },
      { state: 'completed', at: new Date().toISOString() },
    ];

    this.workflows.set(workflowId, { id: workflowId, state: 'completed', plan, events });
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
    record.events.push({ state: 'cancelled', at: new Date().toISOString() });
    return { ok: true };
  }

  async *subscribeEvents(workflowId: string): AsyncIterable<{ state: WorkflowState; at: string }> {
    const record = this.workflows.get(workflowId);
    if (!record) {
      throw new Error(`workflow not found: ${workflowId}`);
    }

    for (const event of record.events) {
      yield event;
    }
  }
}
