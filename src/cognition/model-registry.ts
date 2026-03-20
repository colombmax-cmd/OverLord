import type { SupportedModelProfile } from './interface.ts';

export interface RemoteLlmProviderCatalogEntry {
  providerId: string;
  displayName: string;
  providerLabel: string;
  envPrefix: string;
  apiKeyEnvVar: string;
  defaultApiKeySecretName: string;
  baseUrl: string;
  apiPath: string;
  defaultStore: boolean;
  models: SupportedModelProfile[];
}

const supportedLocalModels: SupportedModelProfile[] = [
  {
    modelId: 'Qwen/Qwen2.5-1.5B-Instruct',
    displayName: 'Qwen 2.5 1.5B Instruct',
    provider: 'Alibaba Cloud / Qwen',
    family: 'Qwen2.5',
    license: 'Apache-2.0',
    format: 'transformers',
    quantization: 'recommended q4/q5 runtime packaging',
    recommendedRuntime: 'llama.cpp or equivalent local runtime',
    minDeviceClass: 'cpu',
    supportsStructuredOutput: true,
    downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct',
    status: 'official',
    recommendedDefault: true,
  },
];

const remoteLlmProviderCatalog: RemoteLlmProviderCatalogEntry[] = [
  {
    providerId: 'xai',
    displayName: 'xAI Responses API',
    providerLabel: 'xAI',
    envPrefix: 'OVERLORD_XAI',
    apiKeyEnvVar: 'XAI_API_KEY',
    defaultApiKeySecretName: 'xai_api_key',
    baseUrl: 'https://api.x.ai/v1',
    apiPath: '/responses',
    defaultStore: false,
    models: [
      {
        modelId: 'grok-4.20-beta-latest-non-reasoning',
        displayName: 'Grok 4.20 Beta Latest Non-Reasoning',
        provider: 'xAI',
        family: 'grok-4.20',
        license: 'service',
        format: 'service',
        recommendedRuntime: 'xAI Responses API adapter',
        minDeviceClass: 'network',
        supportsStructuredOutput: true,
        status: 'official',
        recommendedDefault: true,
      },
    ],
  },
  {
    providerId: 'openai',
    displayName: 'OpenAI Responses API',
    providerLabel: 'OpenAI',
    envPrefix: 'OVERLORD_OPENAI',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultApiKeySecretName: 'openai_api_key',
    baseUrl: 'https://api.openai.com/v1',
    apiPath: '/responses',
    defaultStore: false,
    models: [
      {
        modelId: 'gpt-4.1-mini',
        displayName: 'GPT-4.1 mini',
        provider: 'OpenAI',
        family: 'gpt-4.1',
        license: 'service',
        format: 'service',
        recommendedRuntime: 'OpenAI Responses API adapter',
        minDeviceClass: 'network',
        supportsStructuredOutput: true,
        status: 'official',
        recommendedDefault: false,
      },
    ],
  },
];

const supportedRemoteModels: SupportedModelProfile[] = remoteLlmProviderCatalog.flatMap((provider) =>
  provider.models.map((model) => ({ ...model })),
);

export function listSupportedLocalModels(): SupportedModelProfile[] {
  return supportedLocalModels.map((model) => ({ ...model }));
}

export function listSupportedRemoteModels(): SupportedModelProfile[] {
  return supportedRemoteModels.map((model) => ({ ...model }));
}

export function listSupportedRemoteLlmProviders(): RemoteLlmProviderCatalogEntry[] {
  return remoteLlmProviderCatalog.map(cloneRemoteLlmProvider);
}

export function getSupportedRemoteLlmProvider(providerId: string): RemoteLlmProviderCatalogEntry | null {
  const provider = remoteLlmProviderCatalog.find((entry) => entry.providerId === providerId);
  return provider ? cloneRemoteLlmProvider(provider) : null;
}

export function getDefaultRemoteLlmProvider(): RemoteLlmProviderCatalogEntry {
  const provider = remoteLlmProviderCatalog.find((entry) => entry.models.some((model) => model.recommendedDefault));
  if (!provider) {
    throw new Error('no default remote-LLM provider configured');
  }

  return cloneRemoteLlmProvider(provider);
}

export function getDefaultLocalModel(): SupportedModelProfile {
  const model = supportedLocalModels.find((entry) => entry.recommendedDefault);
  if (!model) {
    throw new Error('no default local cognition model configured');
  }

  return { ...model };
}

export function getDefaultRemoteModel(providerId?: string): SupportedModelProfile {
  const provider = providerId
    ? getSupportedRemoteLlmProvider(providerId)
    : getDefaultRemoteLlmProvider();
  if (!provider) {
    throw new Error(`unsupported remote-LLM provider: ${providerId}`);
  }

  const model = provider.models.find((entry) => entry.recommendedDefault) ?? provider.models[0];
  if (!model) {
    throw new Error(`no default remote cognition model configured for provider: ${provider.providerId}`);
  }

  return { ...model };
}

export function getSupportedLocalModel(modelId: string): SupportedModelProfile | null {
  const model = supportedLocalModels.find((entry) => entry.modelId === modelId);
  return model ? { ...model } : null;
}

export function getSupportedRemoteModel(modelId: string, providerId?: string): SupportedModelProfile | null {
  const models = providerId
    ? getSupportedRemoteLlmProvider(providerId)?.models ?? []
    : supportedRemoteModels;
  const model = models.find((entry) => entry.modelId === modelId);
  return model ? { ...model } : null;
}

export function createRemoteLlmModelProfile(providerId: string, modelId: string): SupportedModelProfile {
  const provider = getSupportedRemoteLlmProvider(providerId);
  if (!provider) {
    throw new Error(`unsupported remote-LLM provider: ${providerId}`);
  }

  const knownModel = getSupportedRemoteModel(modelId, providerId);
  if (knownModel) {
    return knownModel;
  }

  const fallback = getDefaultRemoteModel(providerId);
  return {
    ...fallback,
    modelId,
    displayName: modelId,
    provider: provider.providerLabel,
    recommendedDefault: false,
  };
}

function cloneRemoteLlmProvider(provider: RemoteLlmProviderCatalogEntry): RemoteLlmProviderCatalogEntry {
  return {
    ...provider,
    models: provider.models.map((model) => ({ ...model })),
  };
}
