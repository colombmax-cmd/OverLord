import type { WorkflowPlan } from '../../models/core.ts';

export type WorkflowState = 'submitted' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ExecutionProvider {
  submitWorkflow(plan: WorkflowPlan): Promise<{ workflowId: string }>;
  getWorkflowState(workflowId: string): Promise<{ state: WorkflowState }>;
  cancelWorkflow(workflowId: string, reason: string): Promise<{ ok: true }>;
  subscribeEvents(workflowId: string): AsyncIterable<{ state: WorkflowState; at: string }>;
}
