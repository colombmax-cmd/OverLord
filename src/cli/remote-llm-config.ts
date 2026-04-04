import { getSupportedRemoteLlmProvider } from '../cognition/model-registry.ts';
import { normalizeRemoteLlmBaseUrl, readRemoteLlmProviderProfileFromConfig } from '../cognition/provider-config.ts';
import {
  getOverlordConfigPaths,
  readOverlordUserConfig,
  writeRemoteLlmUserConfig,
} from '../config/user-config.ts';

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export async function runRemoteLlmConfigCli(
  args: string[],
  io: CliIo,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const [command, ...rest] = args;

  if (command === 'set') {
    try {
      const parsed = parseFlags(rest);
      const providerId = requiredFlag(parsed, 'provider')?.toLowerCase();
      const provider = getSupportedRemoteLlmProvider(providerId);
      if (!provider) {
        io.stderr(`Unsupported remote-LLM provider: ${providerId}`);
        return 1;
      }

      const modelId = requiredFlag(parsed, 'model');
      const apiKey = requiredFlag(parsed, 'api-key');
      const baseUrl = normalizeRemoteLlmBaseUrl(parsed['base-url'], provider.baseUrl);
      const store = parseStoreFlag(parsed.store, provider.defaultStore);

      writeRemoteLlmUserConfig({
        providerId: provider.providerId,
        modelId,
        apiKey,
        baseUrl,
        store,
      }, env);

      const paths = getOverlordConfigPaths(env);
      io.stdout(`Saved remote-LLM config for provider '${provider.providerId}' in ${paths.configFile}`);
      io.stdout(`Stored remote-LLM secret in ${paths.secretsFile}`);
      return 0;
    } catch (error) {
      io.stderr(error instanceof Error ? error.message : String(error));
      io.stderr(renderUsage());
      return 1;
    }
  }

  if (command === 'show') {
    try {
      const profile = readRemoteLlmProviderProfileFromConfig(readOverlordUserConfig(env));
      if (!profile) {
        io.stderr('No persisted remote-LLM config found.');
        return 1;
      }

      io.stdout(JSON.stringify({
        providerId: profile.providerId,
        modelId: profile.modelId,
        baseUrl: profile.baseUrl,
        apiKeySecretRef: profile.apiKeySecretRef,
        store: profile.store,
      }, null, 2));
      return 0;
    } catch (error) {
      io.stderr(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  io.stderr(renderUsage());
  return 1;
}

function parseFlags(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function requiredFlag(flags: Record<string, string>, key: string): string {
  const value = flags[key]?.trim();
  if (!value) {
    throw new Error(`missing required flag --${key}`);
  }

  return value;
}

function parseStoreFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  throw new Error(`invalid --store value: ${value}. Expected true|false|1|0`);
}

function renderUsage(): string {
  return [
    'Usage:',
    '  node src/index.ts config remote-llm set --provider <xai|openai> --model <model> --api-key <secret> [--base-url <url>] [--store true|false]',
    '  node src/index.ts config remote-llm show',
  ].join('\n');
}
