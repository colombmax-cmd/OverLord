import type { CognitionBackend, CognitionBackendKind, CognitionContext, CognitionDecision, CognitionPreference, SupportedModelProfile } from './interface.ts';
import { createDefaultRemoteCognitionBackend } from './default-remote-backend.ts';
import { DeterministicLocalCognitionBackend } from './local-backend.ts';

export interface RoutedCognitionBackendOptions {
  localBackend?: CognitionBackend;
  remoteBackend?: CognitionBackend;
}

export class RoutedCognitionBackend implements CognitionBackend {
  readonly kind = 'local' as const;
  readonly defaultModel: SupportedModelProfile;

  private readonly localBackend: CognitionBackend;
  private readonly remoteBackend: CognitionBackend;

  constructor(options: RoutedCognitionBackendOptions = {}) {
    this.localBackend = options.localBackend ?? new DeterministicLocalCognitionBackend();
    this.remoteBackend = options.remoteBackend ?? createDefaultRemoteCognitionBackend();
    this.defaultModel = this.localBackend.defaultModel;
  }

  getSupportedModels(): SupportedModelProfile[] {
    return [
      ...this.localBackend.getSupportedModels(),
      ...this.remoteBackend.getSupportedModels(),
    ];
  }

  async decide(context: CognitionContext): Promise<CognitionDecision> {
    const preference = this.readPreference(context);
    const attemptedBackends: CognitionBackendKind[] = [];

    if (preference === 'remote') {
      attemptedBackends.push('remote');
      if (context.connectivityStatus === 'online') {
        try {
          const decision = await this.remoteBackend.decide(context);
          return this.withRoute(decision, {
            requestedPreference: 'remote',
            selectedBackend: 'remote',
            reason: 'remote preference honored because connectivity is online',
            attemptedBackends,
            fallbackApplied: false,
          });
        } catch (error) {
          if (context.intent.payload.requiresRemoteCognition === true) {
            const decision = await this.localBackend.decide(context);
            return this.withForcedNoAction(decision, {
              requestedPreference: 'remote',
              selectedBackend: 'local',
              reason: `remote cognition failed and is required by payload: ${this.toErrorMessage(error)}`,
              attemptedBackends: [...attemptedBackends, 'local'],
              fallbackApplied: true,
            });
          }

          attemptedBackends.push('local');
          const decision = await this.localBackend.decide(context);
          return this.withRoute(decision, {
            requestedPreference: 'remote',
            selectedBackend: 'local',
            reason: `remote cognition failed; local fallback used: ${this.toErrorMessage(error)}`,
            attemptedBackends,
            fallbackApplied: true,
          });
        }
      }

      if (context.intent.payload.requiresRemoteCognition === true) {
        const decision = await this.localBackend.decide(context);
        return this.withForcedNoAction(decision, {
          requestedPreference: 'remote',
          selectedBackend: 'local',
          reason: 'remote cognition required by payload but unavailable while not online',
          attemptedBackends: [...attemptedBackends, 'local'],
          fallbackApplied: true,
        });
      }

      attemptedBackends.push('local');
      const decision = await this.localBackend.decide(context);
      return this.withRoute(decision, {
        requestedPreference: 'remote',
        selectedBackend: 'local',
        reason: 'remote preference requested but local fallback used because connectivity is not online',
        attemptedBackends,
        fallbackApplied: true,
      });
    }

    attemptedBackends.push('local');
    const decision = await this.localBackend.decide(context);
    return this.withRoute(decision, {
      requestedPreference: preference,
      selectedBackend: 'local',
      reason: preference === 'local'
        ? 'local preference requested explicitly'
        : 'auto routing defaults to local-first cognition',
      attemptedBackends,
      fallbackApplied: false,
    });
  }

  private withRoute(decision: CognitionDecision, route: CognitionDecision['route']): CognitionDecision {
    return {
      ...decision,
      route,
    };
  }

  private withForcedNoAction(decision: CognitionDecision, route: CognitionDecision['route']): CognitionDecision {
    return {
      ...decision,
      proposal: {
        type: 'no_action',
        reason: 'remote cognition unavailable while required by payload',
      },
      route,
      transcript: [
        ...decision.transcript,
        {
          role: 'cognition_backend',
          summary: 'remote_required=true; fallback blocked; returning no_action',
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  private readPreference(context: CognitionContext): CognitionPreference {
    const rawPreference = context.intent.payload.cognitionPreference;
    if (rawPreference === 'local' || rawPreference === 'remote' || rawPreference === 'auto') {
      return rawPreference;
    }

    if (context.intent.payload.preferRemoteCognition === true) {
      return 'remote';
    }

    return 'auto';
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
