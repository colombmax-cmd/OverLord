import type { WorkflowStep } from '../models/core.ts';
import type { CognitionContext, CognitionDecision } from './interface.ts';

export function determineDeterministicProposal(context: CognitionContext): CognitionDecision['proposal'] {
  const { intent, memoryView } = context;
  const payload = intent.payload;

  if (payload.noAction === true) {
    return {
      type: 'no_action',
      reason: 'explicit no-action requested by payload',
    };
  }

  const requiredCapability = readNonEmptyString(payload.requiredCapability);
  if (requiredCapability && requiredCapability !== memoryView.request.capability) {
    return {
      type: 'scope_request',
      missingCapability: requiredCapability,
    };
  }

  if (intent.intentType === 'task.create') {
    const title = readNonEmptyString(payload.title);
    if (!title) {
      return {
        type: 'clarification',
        question: 'What title should be used for this task?',
      };
    }

    const steps: WorkflowStep[] = [
      {
        id: `${intent.id}:step:1`,
        description: `Create task '${title}'`,
        capability: 'workflow:submit',
      },
    ];

    return {
      type: 'proposal',
      steps,
    };
  }

  return {
    type: 'no_action',
    reason: `unsupported intent type '${intent.intentType}'`,
  };
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}
