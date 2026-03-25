import type { SupportedModelProfile } from './interface.ts';
import type { OverlordUserConfig } from '../config/user-config.ts';
import {
  getDefaultRemoteLlmProvider,
  getDefaultRemoteModel,
  getSupportedRemoteLlmProvider,
  listSupportedRemoteLlmProviders,
  type RemoteLlmProviderCatalogEntry,
} from './model-registry.ts';

export interface RemoteLlmProviderProfile {
  providerId: string;
  modelId: string;
  baseUrl: string;
  apiKeySecretRef: string;
  store: boolean;
}

export interface RemoteLlmSelection {
  providerId?: string;
  modelId?: string;
}

export function getDefaultRemoteLlmModelProfile(): SupportedModelProfile {
  return getDefaultRemoteModel();
}

export function readRemoteLlmProviderProfileFromEnv(env: NodeJS.ProcessEnv = process.env): RemoteLlmProviderProfile | null {
  const provider = readRemoteLlmProviderFromEnv(env);
  if (!provider) {
    return null;
  }

  return {
    providerId: provider.providerId,
    modelId: env.OVERLORD_REMOTE_LLM_MODEL?.trim()
      || env[`${provider.envPrefix}_MODEL`]?.trim()
      || getDefaultRemoteModel(provider.providerId).modelId,
    baseUrl: readProviderBaseUrlFromEnv(provider, env),
    apiKeySecretRef: env.OVERLORD_REMOTE_LLM_API_KEY_REF?.trim()
      || env[`${provider.envPrefix}_API_KEY_REF`]?.trim()
      || `product:${provider.defaultApiKeySecretName}`,
    store: readProviderStoreFromEnv(provider, env),
  };
}

export function readRemoteLlmProviderProfileFromConfig(config: OverlordUserConfig | null): RemoteLlmProviderProfile | null {
  const configured = config?.remoteLlm;
  if (!configured) {
    return null;
  }

  const providerId = readRequiredConfigString(configured.providerId, 'remoteLlm.providerId')?.toLowerCase();
  const provider = getRequiredRemoteLlmProvider(providerId);
  const modelId = readNonEmptyString(configured.modelId) || getDefaultRemoteModel(provider.providerId).modelId;

  return {
    providerId: provider.providerId,
    modelId,
    baseUrl: normalizeRemoteLlmBaseUrl(configured.baseUrl, provider.baseUrl),
    apiKeySecretRef: readRequiredConfigString(configured.apiKeySecretRef, 'remoteLlm.apiKeySecretRef'),
    store: readRequiredConfigBoolean(configured.store, 'remoteLlm.store'),
  };
}

export function readRemoteLlmSelectionFromPayload(payload: Record<string, unknown>): RemoteLlmSelection | null {
  const nested = payload.remoteLlm;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const value = nested as Record<string, unknown>;
    const providerId = readNonEmptyString(value.providerId)?.toLowerCase();
    const modelId = readNonEmptyString(value.modelId);
    return providerId || modelId ? { providerId: providerId ?? undefined, modelId: modelId ?? undefined } : null;
  }

  const providerId = readNonEmptyString(payload.remoteLlmProvider)?.toLowerCase();
  const modelId = readNonEmptyString(payload.remoteLlmModel);
  return providerId || modelId ? { providerId: providerId ?? undefined, modelId: modelId ?? undefined } : null;
}

export function resolveRemoteLlmProviderProfile(
  baseProfile: RemoteLlmProviderProfile,
  payload: Record<string, unknown>,
): RemoteLlmProviderProfile {
  const selection = readRemoteLlmSelectionFromPayload(payload);
  const providerId = selection?.providerId ?? baseProfile.providerId;
  const provider = getRequiredRemoteLlmProvider(providerId);
  const providerChanged = provider.providerId !== baseProfile.providerId;

  return {
    providerId: provider.providerId,
    modelId: selection?.modelId
      ?? (providerChanged ? getDefaultRemoteModel(provider.providerId).modelId : baseProfile.modelId),
    baseUrl: providerChanged ? provider.baseUrl : baseProfile.baseUrl,
    apiKeySecretRef: providerChanged ? `product:${provider.defaultApiKeySecretName}` : baseProfile.apiKeySecretRef,
    store: providerChanged ? provider.defaultStore : baseProfile.store,
  };
}

function readRemoteLlmProviderFromEnv(env: NodeJS.ProcessEnv): RemoteLlmProviderCatalogEntry | null {
  const explicitProviderId = env.OVERLORD_REMOTE_LLM_PROVIDER?.trim().toLowerCase()
    || env.OVERLORD_REMOTE_PROVIDER?.trim().toLowerCase();
  if (explicitProviderId) {
    return getRequiredRemoteLlmProvider(explicitProviderId);
  }

  const providers = [getDefaultRemoteLlmProvider(), ...listNonDefaultRemoteProviders()]
    .filter((provider, index, entries) => entries.findIndex((entry) => entry.providerId === provider.providerId) === index);

  const detectedProvider = providers.find((provider) => Boolean(env[provider.apiKeyEnvVar]?.trim()));
  return detectedProvider ?? null;
}

function listNonDefaultRemoteProviders(): RemoteLlmProviderCatalogEntry[] {
  const defaultProviderId = getDefaultRemoteLlmProvider().providerId;
  return listSupportedRemoteLlmProviders().filter((provider) => provider.providerId !== defaultProviderId);
}

function getRequiredRemoteLlmProvider(providerId: string): RemoteLlmProviderCatalogEntry {
  const provider = getSupportedRemoteLlmProvider(providerId);
  if (!provider) {
    throw new Error(`unsupported remote-LLM provider: ${providerId}`);
  }

  return provider;
}

function readProviderBaseUrlFromEnv(provider: RemoteLlmProviderCatalogEntry, env: NodeJS.ProcessEnv): string {
  const directBaseUrlEnvVar = `${provider.providerId.toUpperCase()}_BASE_URL`;
  return normalizeRemoteLlmBaseUrl(
    env.OVERLORD_REMOTE_LLM_BASE_URL
      || env[`${provider.envPrefix}_BASE_URL`]
      || env[directBaseUrlEnvVar]
      || provider.baseUrl,
    provider.baseUrl,
  );
}

function readProviderStoreFromEnv(provider: RemoteLlmProviderCatalogEntry, env: NodeJS.ProcessEnv): boolean {
  const generic = readBooleanFlag(env.OVERLORD_REMOTE_LLM_STORE);
  if (generic !== null) {
    return generic;
  }

  const providerSpecific = readBooleanFlag(env[`${provider.envPrefix}_STORE`]);
  if (providerSpecific !== null) {
    return providerSpecific;
  }

  return provider.defaultStore;
}

function readBooleanFlag(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();
  if (normalized === '1' || normalized.toLowerCase() === 'true') {
    return true;
  }

  if (normalized === '0' || normalized.toLowerCase() === 'false') {
    return false;
  }

  return null;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function normalizeRemoteLlmBaseUrl(rawValue: string | undefined, fallbackBaseUrl?: string): string {
  const value = readNonEmptyString(rawValue) || fallbackBaseUrl;
  if (!value) {
    throw new Error('remote-LLM baseUrl is required');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch (error) {
    throw new Error(`remote-LLM baseUrl must be a valid absolute URL: ${toErrorMessage(error)}`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`remote-LLM baseUrl must use http or https, received ${parsedUrl.protocol}`);
  }

  return value.replace(/\/$/, '');
}

function readRequiredConfigString(value: unknown, fieldName: string): string {
  const normalized = readNonEmptyString(value);
  if (!normalized) {
    throw new Error(`invalid persisted remote-LLM config: ${fieldName} must be a non-empty string`);
  }

  return normalized;
}

function readRequiredConfigBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`invalid persisted remote-LLM config: ${fieldName} must be a boolean`);
  }

  return value;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
