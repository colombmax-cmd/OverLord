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
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_MAX = 1;
const DEFAULT_RETRY_BACKOFF_MS = 250;

export class LocalLlmCognitionBackend implements CognitionBackend {
  readonly kind = 'local' as const;
  readonly defaultModel: SupportedModelProfile;

  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly runtimeModel: string;
  private readonly timeoutMs: number;
  private readonly retryMax: number;
  private readonly retryBackoffMs: number;

  constructor(options: LocalLlmBackendOptions = {}) {
    const env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? undiciFetch;
    this.baseUrl = (env.OVERLORD_LOCAL_LLM_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, '');
    this.runtimeModel = env.OVERLORD_LOCAL_LLM_MODEL ?? DEFAULT_OLLAMA_MODEL;
    this.timeoutMs = normalizeInteger(env.OVERLORD_LOCAL_LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    this.retryMax = normalizeInteger(env.OVERLORD_LOCAL_LLM_RETRY_MAX, DEFAULT_RETRY_MAX);
    this.retryBackoffMs = normalizeInteger(env.OVERLORD_LOCAL_LLM_RETRY_BACKOFF_MS, DEFAULT_RETRY_BACKOFF_MS);
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
    const payload = await this.callLocalRuntime(prompt);
    const output = payload.response?.trim();
    if (!output) {
      throw new Error('local-llm returned an empty response');
    }

    const parsedProposal = parseProposal(output);
    const proposal = parsedProposal.proposal;
    transcript.push({
      role: 'cognition_backend',
      summary: [
        'backend=local-llm',
        `model=${this.runtimeModel}`,
        `proposal=${proposal.type}`,
        `parser=${parsedProposal.parser}`,
      ].join('; '),
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

  private async callLocalRuntime(prompt: string): Promise<{ response?: string }> {
    const endpoint = `${this.baseUrl}/api/generate`;
    const maxAttempts = this.retryMax + 1;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const response = await this.fetchImpl(endpoint, {
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
            signal: controller.signal,
          });

          if (!response.ok) {
            const body = await response.text();
            throw new Error(`http_${response.status}:${response.statusText}; body=${truncateForError(body)}`);
          }

          return await response.json() as { response?: string };
        } finally {
          clearTimeout(timeoutHandle);
        }
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) {
          break;
        }

        await sleep(this.retryBackoffMs * attempt);
      }
    }

    throw new Error(
      `local-llm runtime request failed after ${maxAttempts} attempt(s): ${normalizeRuntimeError(lastError)}`,
      { cause: lastError instanceof Error ? lastError : undefined },
    );
  }
}

function parseProposal(raw: string): { proposal: AgentProposal; parser: 'local_json' | 'local_fenced_json' } {
  const candidates = buildParseCandidates(raw);
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate.text);
    } catch {
      if (candidate.required) {
        throw new Error(`local-llm returned invalid JSON: ${truncateForError(raw)}`);
      }

      continue;
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('local-llm returned non-object JSON');
    }

    const value = parsed as Record<string, unknown>;
    const type = value.type;
    if (type === 'proposal') {
      const steps = normalizeSteps(value.steps);
      return { proposal: { type: 'proposal', steps }, parser: candidate.parser };
    }

    if (type === 'clarification' && typeof value.question === 'string' && value.question.trim().length > 0) {
      return { proposal: { type: 'clarification', question: value.question.trim() }, parser: candidate.parser };
    }

    if (type === 'scope_request' && typeof value.missingCapability === 'string' && value.missingCapability.trim().length > 0) {
      return { proposal: { type: 'scope_request', missingCapability: value.missingCapability.trim() }, parser: candidate.parser };
    }

    if (type === 'no_action' && typeof value.reason === 'string' && value.reason.trim().length > 0) {
      return { proposal: { type: 'no_action', reason: value.reason.trim() }, parser: candidate.parser };
    }

    throw new Error(`local-llm returned unsupported proposal payload: ${truncateForError(raw)}`);
  }

  throw new Error(`local-llm response did not contain valid JSON proposal: ${truncateForError(raw)}`);
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

function buildParseCandidates(rawText: string): Array<{
  text: string;
  parser: 'local_json' | 'local_fenced_json';
  required: boolean;
}> {
  const trimmed = rawText.trim();
  const candidates: Array<{
    text: string;
    parser: 'local_json' | 'local_fenced_json';
    required: boolean;
  }> = [];

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    candidates.push({ text: trimmed, parser: 'local_json', required: true });
  }

  const fencedBlocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
  for (const block of fencedBlocks) {
    candidates.push({ text: block, parser: 'local_fenced_json', required: false });
  }

  return candidates;
}

function normalizeRuntimeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'timeout';
    }

    return error.message;
  }

  return String(error);
}

function normalizeInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function truncateForError(value: string, limit = 240): string {
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}…`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
