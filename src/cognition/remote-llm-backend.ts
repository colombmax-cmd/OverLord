import { EnvHttpProxyAgent } from 'undici';

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

interface RemoteProposalParseResult {
  proposal: CognitionDecision['proposal'] | null;
  parser: 'remote_json' | 'remote_fenced_json' | 'deterministic_fallback';
  issue?: string;
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

    const requestUrl = `${profile.baseUrl}${provider.apiPath}`;
    const dispatcher = await createProxyDispatcher();

    let response: Response;
    try {
      response = await this.fetchImpl(requestUrl, {
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
        ...(dispatcher ? { dispatcher } : {}),
      });
    } catch (error) {
      throw new Error(
        `remote-LLM network request failed for ${requestUrl}: ${toErrorMessage(error)}`,
        { cause: error },
      );
    }

    const payload = await parseResponsesApiPayload(response, requestUrl);
    const contentText = extractResponseText(payload);
    const parsedProposal = parseRemoteProposal(contentText);
    const proposal = parsedProposal.proposal ?? determineDeterministicProposal(context);

    transcript.push({
      role: 'cognition_backend',
      summary: [
        `provider=remote-llm`,
        `driver=${profile.providerId}`,
        `model=${profile.modelId}`,
        `proposal=${proposal.type}`,
        `parser=${parsedProposal.parser}`,
        parsedProposal.issue ? `issue=${parsedProposal.issue}` : null,
      ].filter(Boolean).join('; '),
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

async function createProxyDispatcher(): Promise<object | undefined> {
  const hasProxy = Boolean(
    process.env.HTTPS_PROXY?.trim()
      || process.env.https_proxy?.trim()
      || process.env.HTTP_PROXY?.trim()
      || process.env.http_proxy?.trim(),
  );

  if (!hasProxy) {
    return undefined;
  }

  try {
    const { EnvHttpProxyAgent } = await import('undici');
    return new EnvHttpProxyAgent();
  } catch {
    return { kind: 'env-proxy-configured-without-undici' };
  }
}

async function parseResponsesApiPayload(response: Response, requestUrl: string): Promise<RemoteLlmResponsesApiResult> {
  const rawBody = await response.text();
  const trimmedBody = rawBody.trim();

  if (!response.ok) {
    throw new Error(formatHttpFailureMessage(response, requestUrl, trimmedBody));
  }

  if (!trimmedBody) {
    throw new Error(`remote-LLM response body was empty for ${requestUrl}`);
  }

  try {
    return JSON.parse(trimmedBody) as RemoteLlmResponsesApiResult;
  } catch (error) {
    throw new Error(
      `remote-LLM response was not valid JSON for ${requestUrl}: ${toErrorMessage(error)}; body=${truncateForError(trimmedBody)}`,
      { cause: error },
    );
  }
}

function extractResponseText(payload: RemoteLlmResponsesApiResult): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputText = payload.output?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === undefined || item.type === 'output_text' || item.type === 'text')
    .map((item) => item.text ?? '')
    .find((text) => text.trim());
  if (outputText) {
    return outputText.trim();
  }

  const choice = payload.choices?.[0]?.message?.content;
  if (typeof choice === 'string' && choice.trim()) {
    return choice.trim();
  }

  if (Array.isArray(choice)) {
    const text = choice
      .filter((entry) => entry.type === undefined || entry.type === 'output_text' || entry.type === 'text')
      .map((entry) => entry.text ?? '')
      .find((value) => value.trim());
    if (text) {
      return text.trim();
    }
  }

  throw new Error('remote-LLM response did not contain textual output');
}

function parseRemoteProposal(rawText: string): RemoteProposalParseResult {
  for (const candidate of buildProposalParseCandidates(rawText)) {
    try {
      const parsed = JSON.parse(candidate.text) as Record<string, unknown>;
      const proposal = validateRemoteProposal(parsed);
      if (proposal) {
        return {
          proposal,
          parser: candidate.parser,
        };
      }

      return {
        proposal: null,
        parser: 'deterministic_fallback',
        issue: 'invalid_remote_schema',
      };
    } catch (error) {
      if (candidate.required) {
        return {
          proposal: null,
          parser: 'deterministic_fallback',
          issue: `invalid_remote_json:${toErrorMessage(error)}`,
        };
      }
    }
  }

  return {
    proposal: null,
    parser: 'deterministic_fallback',
    issue: 'missing_remote_json',
  };
}

function buildProposalParseCandidates(rawText: string): Array<{
  text: string;
  parser: 'remote_json' | 'remote_fenced_json';
  required: boolean;
}> {
  const trimmed = rawText.trim();
  const candidates: Array<{
    text: string;
    parser: 'remote_json' | 'remote_fenced_json';
    required: boolean;
  }> = [];

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    candidates.push({ text: trimmed, parser: 'remote_json', required: true });
  }

  const fencedBlocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  for (const block of fencedBlocks) {
    candidates.push({ text: block, parser: 'remote_fenced_json', required: false });
  }

  return candidates;
}

function validateRemoteProposal(parsed: Record<string, unknown>): CognitionDecision['proposal'] | null {
  const type = readNonEmptyString(parsed.type);

  if (type === 'proposal') {
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return null;
    }

    const usedIds = new Set<string>();
    const steps = parsed.steps.flatMap((step, index) => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) {
        return [];
      }

      const value = step as Record<string, unknown>;
      const description = readNonEmptyString(value.description);
      if (!description) {
        return [];
      }

      const capability = readNonEmptyString(value.capability) ?? 'workflow:submit';
      const proposedId = readNonEmptyString(value.id) ?? `remote-step-${index + 1}`;
      const id = ensureUniqueStepId(proposedId, usedIds);

      return [{
        id,
        description,
        capability,
      }];
    });

    return steps.length > 0 ? { type, steps } : null;
  }

  if (type === 'clarification') {
    const question = readNonEmptyString(parsed.question);
    return question ? { type, question } : null;
  }

  if (type === 'scope_request') {
    const missingCapability = readNonEmptyString(parsed.missingCapability);
    return missingCapability ? { type, missingCapability } : null;
  }

  if (type === 'no_action') {
    const reason = readNonEmptyString(parsed.reason);
    return reason ? { type, reason } : null;
  }

  return null;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatHttpFailureMessage(response: Response, requestUrl: string, responseBody: string): string {
  const statusText = response.statusText ? ` ${response.statusText}` : '';
  const bodySuffix = responseBody ? `; body=${truncateForError(responseBody)}` : '';
  return `remote-LLM request failed for ${requestUrl} with status ${response.status}${statusText}${bodySuffix}`;
}

function truncateForError(value: string, maxLength = 240): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function ensureUniqueStepId(candidate: string, usedIds: Set<string>): string {
  let nextId = candidate;
  let suffix = 2;
  while (usedIds.has(nextId)) {
    nextId = `${candidate}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(nextId);
  return nextId;
}
