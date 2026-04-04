import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export interface OverlordUserConfig {
  remoteLlm?: {
    providerId: string;
    modelId: string;
    baseUrl: string;
    apiKeySecretRef: string;
    store: boolean;
  };
}

export interface OverlordSecretsConfig {
  [secretName: string]: string | undefined;
}

export interface OverlordConfigPaths {
  configDir: string;
  configFile: string;
  secretsFile: string;
}

export interface PersistedRemoteLlmConfigInput {
  providerId: string;
  modelId: string;
  baseUrl: string;
  apiKey: string;
  store: boolean;
}

const DEFAULT_REMOTE_LLM_SECRET_NAME = 'remote_llm_api_key';

export function getOverlordConfigPaths(env: NodeJS.ProcessEnv = process.env): OverlordConfigPaths {
  const configDir = resolve(
    env.OVERLORD_CONFIG_DIR?.trim()
      || join(env.HOME?.trim() || homedir(), '.config', 'overlord'),
  );

  return {
    configDir,
    configFile: resolve(env.OVERLORD_CONFIG_FILE?.trim() || join(configDir, 'config.json')),
    secretsFile: resolve(env.OVERLORD_SECRETS_FILE?.trim() || join(configDir, 'secrets.json')),
  };
}

export function readOverlordUserConfig(env: NodeJS.ProcessEnv = process.env): OverlordUserConfig | null {
  const paths = getOverlordConfigPaths(env);
  return readJsonFile<OverlordUserConfig>(paths.configFile);
}

export function readOverlordSecretsConfig(env: NodeJS.ProcessEnv = process.env): OverlordSecretsConfig | null {
  const paths = getOverlordConfigPaths(env);
  return readJsonFile<OverlordSecretsConfig>(paths.secretsFile);
}

export function writeRemoteLlmUserConfig(
  input: PersistedRemoteLlmConfigInput,
  env: NodeJS.ProcessEnv = process.env,
): OverlordUserConfig {
  const paths = getOverlordConfigPaths(env);
  ensureParentDir(paths.configFile);
  ensureParentDir(paths.secretsFile);

  const config = readOverlordUserConfig(env) ?? {};
  config.remoteLlm = {
    providerId: input.providerId,
    modelId: input.modelId,
    baseUrl: input.baseUrl.replace(/\/$/, ''),
    apiKeySecretRef: `config:${DEFAULT_REMOTE_LLM_SECRET_NAME}`,
    store: input.store,
  };

  const secrets = readOverlordSecretsConfig(env) ?? {};
  secrets[DEFAULT_REMOTE_LLM_SECRET_NAME] = input.apiKey;

  writeJsonFile(paths.configFile, config);
  writeJsonFile(paths.secretsFile, secrets, 0o600);
  return config;
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const raw = readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as T;
}

function writeJsonFile(filePath: string, value: unknown, mode = 0o644): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode });
  chmodSync(filePath, mode);
}

function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}
