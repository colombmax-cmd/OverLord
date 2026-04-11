import { fetch as undiciFetch } from 'undici';

import type { AgentProposal, WorkflowStep } from '../models/core.ts';
import {
  getDefaultLocalModel,
  getSupportedLocalModel,
  listSupportedLocalModels,
} from './model-registry.ts';
import type {
  CognitionBackend,
  CognitionContext,
  CognitionDecision,
  CognitiveExchange,
  SupportedModelProfile,
} from './interface.ts';

export interface LocalLlmBackendOptions {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5:1.5b-instruct';

export class LocalLlmCognitionBackend implements CognitionBackend {
  readonly kind = 'local' as const;
  readonly defaultModel: SupportedModelProfile;

  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly runtimeModel: string;

  constructor(options: LocalLlmBackendOptions = {}) {
    const env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? undiciFetch;
    this.baseUrl = (env.OVERLORD_LOCAL_LLM_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, '');
    this.runtimeModel = env.OVERLORD_LOCAL_LLM_MODEL ?? DEFAULT_OLLAMA_MODEL;
    this.defaultModel = this.resolveModelProfile(this.runtimeModel);
  }

  getSupportedModels(): SupportedModelProfile[] {
    const supported = listSupportedLocalModels();
    if (supported.some((model) => model.modelId === this.defaultModel.modelId)) {
      return supported;
    }

    return [...supported, { ...this.defaultModel }];
  }

  async decide(context: CognitionContext): Promise<CognitionDecision> {
    const transcript: CognitiveExchange[] = [
      {
        role: 'overlord',
        summary: `intent=${context.intent.intentType}; scopes=${context.memoryView.effectiveScopes.join(',') || 'none'}; connectivity=${context.connectivityStatus}`,
        timestamp: new Date().toISOString(),
      },
    ];

    const prompt = this.buildPrompt(context);
    const response = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.runtimeModel,
        stream: false,
        format: 'json',
        prompt,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`local-llm request failed (${response.status} ${response.statusText}): ${body}`);
    }

    const payload = await response.json() as { response?: string };
    const output = payload.response?.trim();
    if (!output) {
      throw new Error('local-llm returned an empty response');
    }

    const proposal = parseProposal(output);
    transcript.push({
      role: 'cognition_backend',
      summary: `backend=local-llm; model=${this.runtimeModel}; proposal=${proposal.type}`,
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
        reason: 'local runtime cognition backend selected directly',
        attemptedBackends: ['local'],
        fallbackApplied: false,
      },
    };
  }

  private resolveModelProfile(modelId: string): SupportedModelProfile {
    const supported = getSupportedLocalModel(modelId);
    if (supported) {
      return supported;
    }

    const fallback = getDefaultLocalModel();
    return {
      ...fallback,
      modelId,
      displayName: modelId,
      provider: 'Local Runtime',
      recommendedRuntime: 'ollama / local-llm runtime',
      recommendedDefault: true,
    };
  }

  private buildPrompt(context: CognitionContext): string {
    return [
      'You are Overlord local cognition. Return JSON only.',
      'Allowed schema:',
      '{"type":"proposal","steps":[{"id":"step-1","description":"...","capability":"workflow:submit"}]}',
      '{"type":"clarification","question":"..."}',
      '{"type":"scope_request","missingCapability":"..."}',
      '{"type":"no_action","reason":"..."}',
      `Intent type: ${context.intent.intentType}`,
      `Payload: ${JSON.stringify(context.intent.payload)}`,
    ].join('\n');
  }
}

function parseProposal(raw: string): AgentProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`local-llm returned invalid JSON: ${raw}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('local-llm returned non-object JSON');
  }

  const value = parsed as Record<string, unknown>;
  const type = value.type;
  if (type === 'proposal') {
    const steps = normalizeSteps(value.steps);
    return { type: 'proposal', steps };
  }

  if (type === 'clarification' && typeof value.question === 'string' && value.question.trim().length > 0) {
    return { type: 'clarification', question: value.question.trim() };
  }

  if (type === 'scope_request' && typeof value.missingCapability === 'string' && value.missingCapability.trim().length > 0) {
    return { type: 'scope_request', missingCapability: value.missingCapability.trim() };
  }

  if (type === 'no_action' && typeof value.reason === 'string' && value.reason.trim().length > 0) {
    return { type: 'no_action', reason: value.reason.trim() };
  }

  throw new Error(`local-llm returned unsupported proposal payload: ${raw}`);
}

function normalizeSteps(input: unknown): WorkflowStep[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('local-llm returned proposal without steps');
  }

  const seenIds = new Set<string>();
  return input.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('local-llm proposal step must be an object');
    }

    const step = entry as Record<string, unknown>;
    const description = typeof step.description === 'string' && step.description.trim().length > 0
      ? step.description.trim()
      : null;
    const capability = typeof step.capability === 'string' && step.capability.trim().length > 0
      ? step.capability.trim()
      : null;

    if (!description || !capability) {
      throw new Error('local-llm proposal steps require description and capability');
    }

    const rawId = typeof step.id === 'string' && step.id.trim().length > 0
      ? step.id.trim()
      : `local-step-${index + 1}`;
    const id = seenIds.has(rawId) ? `${rawId}-${index + 1}` : rawId;
    seenIds.add(id);

    return { id, description, capability };
  });
}
