import type { IntentEnvelope, AgentProposal } from '../models/core.ts';
import type { PlosMemoryView } from '../ports/plos.ts';
import { RoutedCognitionBackend } from '../cognition/router-backend.ts';

export interface PlanningContext {
  intent: IntentEnvelope;
  memoryView: PlosMemoryView;
}

export interface PlanningEngine {
  propose(context: PlanningContext): Promise<AgentProposal>;
}

export class DeterministicPlanningEngine implements PlanningEngine {
  private readonly cognitionBackend = new RoutedCognitionBackend();

  async propose(context: PlanningContext): Promise<AgentProposal> {
    return (await this.cognitionBackend.decide({
      ...context,
      connectivityStatus: 'offline',
    })).proposal;
  }
}
