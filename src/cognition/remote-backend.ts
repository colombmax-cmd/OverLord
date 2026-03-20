import type { CognitionBackend, CognitionContext, CognitionDecision, CognitiveExchange, SupportedModelProfile } from './interface.ts';
import { determineDeterministicProposal } from './deterministic-proposal.ts';
import { getDefaultRemoteModel, getSupportedRemoteModel, listSupportedRemoteModels } from './model-registry.ts';

export interface DeterministicRemoteCognitionBackendOptions {
  modelId?: string;
}

export class DeterministicRemoteCognitionBackend implements CognitionBackend {
  readonly kind = 'remote' as const;
  readonly defaultModel: SupportedModelProfile;

  constructor(options: DeterministicRemoteCognitionBackendOptions = {}) {
    this.defaultModel = options.modelId
      ? this.resolveModel(options.modelId)
      : getDefaultRemoteModel();
  }

  getSupportedModels(): SupportedModelProfile[] {
    return listSupportedRemoteModels();
  }

  async decide(context: CognitionContext): Promise<CognitionDecision> {
    if (context.connectivityStatus !== 'online') {
      throw new Error(`remote cognition backend requires online connectivity, received ${context.connectivityStatus}`);
    }

    const transcript: CognitiveExchange[] = [
      {
        role: 'overlord',
        summary: `intent=${context.intent.intentType}; route=remote; connectivity=${context.connectivityStatus}`,
        timestamp: new Date().toISOString(),
      },
    ];

    const proposal = determineDeterministicProposal(context);

    transcript.push({
      role: 'cognition_backend',
      summary: `backend=remote; model=${this.defaultModel.modelId}; proposal=${proposal.type}`,
      timestamp: new Date().toISOString(),
    });

    return {
      proposal,
      backendKind: this.kind,
      connectivityStatus: context.connectivityStatus,
      selectedModel: { ...this.defaultModel },
      transcript,
      route: {
        requestedPreference: 'remote',
        selectedBackend: 'remote',
        reason: 'remote cognition backend selected directly',
        attemptedBackends: ['remote'],
        fallbackApplied: false,
      },
    };
  }

  private resolveModel(modelId: string): SupportedModelProfile {
    const model = getSupportedRemoteModel(modelId);
    if (!model) {
      throw new Error(`unsupported remote cognition model: ${modelId}`);
    }

    return model;
  }
}
