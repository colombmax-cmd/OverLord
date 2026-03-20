import type { SecretResolver } from '../ports/secrets.ts';
import type { CognitionBackend, CognitionContext, CognitionDecision, CognitiveExchange, SupportedModelProfile } from './interface.ts';
import type { RemoteLlmProviderProfile } from './provider-config.ts';
import { resolveRemoteLlmProviderProfile } from './provider-config.ts';
import { determineDeterministicProposal } from './deterministic-proposal.ts';
import { createRemoteLlmModelProfile, getSupportedRemoteLlmProvider } from './model-registry.ts';

export interface RemoteLlmCognitionBackendOptions {
  profile: RemoteLlmProviderProfile;
  secretResolver: SecretResolver;
  fetchImpl?: typeof fetch;
}

interface RemoteLlmResponsesApiResult {
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string; type?: string }>;
  }>;
  choices?: Array<{
    message?: { content?: string | Array<{ text?: string; type?: string }> };
  }>;
}

export class RemoteLlmCognitionBackend implements CognitionBackend {
  readonly kind = 'remote' as const;
  readonly defaultModel: SupportedModelProfile;

  private readonly fetchImpl: typeof fetch;
  private readonly options: RemoteLlmCognitionBackendOptions;

  constructor(options: RemoteLlmCognitionBackendOptions) {
    this.options = options;
    this.defaultModel = createRemoteLlmModelProfile(options.profile.providerId, options.profile.modelId);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getSupportedModels(): SupportedModelProfile[] {
    return [{ ...this.defaultModel }];
  }

  async decide(context: CognitionContext): Promise<CognitionDecision> {
    if (context.connectivityStatus !== 'online') {
      throw new Error(`remote-LLM cognition backend requires online connectivity, received ${context.connectivityStatus}`);
    }

    const profile = resolveRemoteLlmProviderProfile(this.options.profile, context.intent.payload);

    const transcript: CognitiveExchange[] = [
      {
        role: 'overlord',
        summary: `provider=remote-llm; driver=${profile.providerId}; model=${profile.modelId}; store=${String(profile.store)}; connectivity=${context.connectivityStatus}`,
        timestamp: new Date().toISOString(),
      },
    ];

    const apiKey = await this.options.secretResolver.resolve(profile.apiKeySecretRef);
    const provider = getSupportedRemoteLlmProvider(profile.providerId);
    if (!provider) {
      throw new Error(`unsupported remote-LLM provider: ${profile.providerId}`);
    }

    const response = await this.fetchImpl(`${profile.baseUrl}${provider.apiPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: profile.modelId,
        store: profile.store,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: [
                  'You are Overlord remote cognition.',
                  'Return only valid JSON.',
                  'Schema:',
                  '{"type":"proposal|clarification|scope_request|no_action","steps":[{"id":"...","description":"...","capability":"..."}],"question":"...","missingCapability":"...","reason":"..."}',
                  'If type is proposal include steps. Otherwise include only the relevant field.',
                ].join(' '),
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  intentType: context.intent.intentType,
                  payload: context.intent.payload,
                  capability: context.memoryView.request.capability,
                  effectiveScopes: context.memoryView.effectiveScopes,
                }),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`remote-LLM request failed with status ${response.status}`);
    }

    const payload = await response.json() as RemoteLlmResponsesApiResult;
    const contentText = extractResponseText(payload);
    const parsedProposal = parseRemoteProposal(contentText);
    const proposal = parsedProposal ?? determineDeterministicProposal(context);

    transcript.push({
      role: 'cognition_backend',
      summary: `provider=remote-llm; driver=${profile.providerId}; model=${profile.modelId}; proposal=${proposal.type}; parser=${parsedProposal ? 'remote_json' : 'deterministic_fallback'}`,
      timestamp: new Date().toISOString(),
    });

    return {
      proposal,
      backendKind: this.kind,
      connectivityStatus: context.connectivityStatus,
      selectedModel: createRemoteLlmModelProfile(profile.providerId, profile.modelId),
      transcript,
      route: {
        requestedPreference: 'remote',
        selectedBackend: 'remote',
        reason: 'remote-LLM cognition backend selected successfully',
        attemptedBackends: ['remote'],
        fallbackApplied: false,
      },
    };
  }
}

function extractResponseText(payload: RemoteLlmResponsesApiResult): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  const outputText = payload.output?.flatMap((item) => item.content ?? [])
    .map((item) => item.text ?? '')
    .find((text) => text.trim());
  if (outputText) {
    return outputText;
  }

  const choice = payload.choices?.[0]?.message?.content;
  if (typeof choice === 'string' && choice.trim()) {
    return choice;
  }

  if (Array.isArray(choice)) {
    const text = choice.map((entry) => entry.text ?? '').find((value) => value.trim());
    if (text) {
      return text;
    }
  }

  throw new Error('remote-LLM response did not contain textual output');
}

function parseRemoteProposal(rawText: string): CognitionDecision['proposal'] | null {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const type = parsed.type;

    if (type === 'proposal' && Array.isArray(parsed.steps)) {
      return {
        type,
        steps: parsed.steps.map((step, index) => {
          const value = step as Record<string, unknown>;
          return {
            id: typeof value.id === 'string' ? value.id : `remote-step-${index + 1}`,
            description: typeof value.description === 'string' ? value.description : `Remote step ${index + 1}`,
            capability: typeof value.capability === 'string' ? value.capability : 'workflow:submit',
          };
        }),
      };
    }

    if (type === 'clarification' && typeof parsed.question === 'string') {
      return { type, question: parsed.question };
    }

    if (type === 'scope_request' && typeof parsed.missingCapability === 'string') {
      return { type, missingCapability: parsed.missingCapability };
    }

    if (type === 'no_action' && typeof parsed.reason === 'string') {
      return { type, reason: parsed.reason };
    }

    return null;
  } catch {
    return null;
  }
}
