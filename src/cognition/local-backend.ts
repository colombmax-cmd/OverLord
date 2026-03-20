import type { CognitionBackend, CognitionContext, CognitionDecision, CognitiveExchange, SupportedModelProfile } from './interface.ts';
import { determineDeterministicProposal } from './deterministic-proposal.ts';
import { getDefaultLocalModel, getSupportedLocalModel, listSupportedLocalModels } from './model-registry.ts';

export interface DeterministicLocalCognitionBackendOptions {
  modelId?: string;
}

export class DeterministicLocalCognitionBackend implements CognitionBackend {
  readonly kind = 'local' as const;
  readonly defaultModel: SupportedModelProfile;

  constructor(options: DeterministicLocalCognitionBackendOptions = {}) {
    this.defaultModel = options.modelId
      ? this.resolveModel(options.modelId)
      : getDefaultLocalModel();
  }

  getSupportedModels(): SupportedModelProfile[] {
    return listSupportedLocalModels();
  }

  async decide(context: CognitionContext): Promise<CognitionDecision> {
    const transcript: CognitiveExchange[] = [
      {
        role: 'overlord',
        summary: `intent=${context.intent.intentType}; scopes=${context.memoryView.effectiveScopes.join(',') || 'none'}; connectivity=${context.connectivityStatus}`,
        timestamp: new Date().toISOString(),
      },
    ];

    const proposal = determineDeterministicProposal(context);

    transcript.push({
      role: 'cognition_backend',
      summary: `backend=local; model=${this.defaultModel.modelId}; proposal=${proposal.type}`,
      timestamp: new Date().toISOString(),
    });

    return {
      proposal,
      backendKind: this.kind,
      connectivityStatus: context.connectivityStatus,
      selectedModel: { ...this.defaultModel },
      transcript,
      route: {
        requestedPreference: 'local',
        selectedBackend: 'local',
        reason: 'local cognition backend selected directly',
        attemptedBackends: ['local'],
        fallbackApplied: false,
      },
    };
  }

  private resolveModel(modelId: string): SupportedModelProfile {
    const model = getSupportedLocalModel(modelId);
    if (!model) {
      throw new Error(`unsupported local cognition model: ${modelId}`);
    }

    return model;
  }
}
