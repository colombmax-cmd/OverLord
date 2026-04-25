import type { CognitionBackend, CognitionContext, CognitionDecision, SupportedModelProfile } from './interface.ts';
import { DeterministicLocalCognitionBackend } from './local-backend.ts';
import { LocalLlmCognitionBackend } from './local-llm-backend.ts';

class LocalRuntimeFallbackBackend implements CognitionBackend {
  readonly kind = 'local' as const;
  readonly defaultModel: SupportedModelProfile;

  private readonly primary: CognitionBackend;
  private readonly fallback: CognitionBackend;

  constructor(primary: CognitionBackend, fallback: CognitionBackend) {
    this.primary = primary;
    this.fallback = fallback;
    this.defaultModel = primary.defaultModel;
  }

  getSupportedModels(): SupportedModelProfile[] {
    return this.primary.getSupportedModels();
  }

  async decide(context: CognitionContext): Promise<CognitionDecision> {
    try {
      return await this.primary.decide(context);
    } catch (error) {
      const fallbackDecision = await this.fallback.decide(context);
      const reason = classifyFallbackReason(error);
      return {
        ...fallbackDecision,
        route: {
          ...fallbackDecision.route,
          requestedPreference: 'local',
          selectedBackend: 'local',
          reason: `local runtime fallback: ${reason}`,
          attemptedBackends: ['local'],
          fallbackApplied: true,
        },
        transcript: [
          ...fallbackDecision.transcript,
          {
            role: 'cognition_backend',
            summary: `local-runtime fallback activated: ${reason}`,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }
  }
}

export function createDefaultLocalCognitionBackend(env: NodeJS.ProcessEnv = process.env): CognitionBackend {
  const deterministic = new DeterministicLocalCognitionBackend();
  if (env.OVERLORD_LOCAL_LLM_ENABLED !== '1') {
    return deterministic;
  }

  const runtimeBackend = new LocalLlmCognitionBackend({ env });
  return new LocalRuntimeFallbackBackend(runtimeBackend, deterministic);
}

function classifyFallbackReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes('timeout')) {
    return 'runtime_timeout';
  }

  if (normalized.includes('http_')) {
    return 'runtime_http_error';
  }

  if (normalized.includes('invalid json') || normalized.includes('unsupported proposal')) {
    return 'runtime_invalid_payload';
  }

  return `runtime_unavailable (${message})`;
}
