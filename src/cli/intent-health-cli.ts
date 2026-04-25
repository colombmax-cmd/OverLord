import { readRemoteLlmProviderProfileFromConfig, readRemoteLlmProviderProfileFromEnv } from '../cognition/provider-config.ts';
import { getOverlordConfigPaths, readOverlordUserConfig } from '../config/user-config.ts';
import type { CognitionConnectivityStatus } from '../cognition/interface.ts';

export interface IntentHealthCliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export async function runIntentHealthCli(
  io: IntentHealthCliIo,
  options: {
    env?: NodeJS.ProcessEnv;
    connectivityStatus: CognitionConnectivityStatus;
    fetchImpl?: typeof fetch;
  },
): Promise<number> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const configPaths = getOverlordConfigPaths(env);
  const configProfile = safeReadConfigProfile(env);
  const envProfile = safeReadEnvProfile(env);

  const lines = [
    'Overlord Health',
    '==============',
    `Connectivity: ${options.connectivityStatus}`,
    `Config file: ${configPaths.configFile}`,
    `Secrets file: ${configPaths.secretsFile}`,
    `Local runtime enabled: ${env.OVERLORD_LOCAL_LLM_ENABLED === '1' ? 'yes' : 'no'}`,
  ];

  if (env.OVERLORD_LOCAL_LLM_ENABLED === '1') {
    const baseUrl = (env.OVERLORD_LOCAL_LLM_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
    const timeoutMs = env.OVERLORD_LOCAL_LLM_TIMEOUT_MS ?? '8000';
    lines.push(`Local runtime base URL: ${baseUrl}`);
    lines.push(`Local runtime model: ${env.OVERLORD_LOCAL_LLM_MODEL ?? 'qwen2.5:1.5b-instruct'}`);
    lines.push(`Local runtime timeout ms: ${timeoutMs}`);
    lines.push(`Local runtime retry max: ${env.OVERLORD_LOCAL_LLM_RETRY_MAX ?? '1'}`);
    const probe = await probeLocalRuntime(fetchImpl, baseUrl, Number.parseInt(timeoutMs, 10) || 8000);
    lines.push(`Local runtime status: ${probe.ok ? 'reachable' : `unreachable (${probe.reason})`}`);
  }

  if (configProfile) {
    lines.push(`Remote profile source: config (${configProfile.providerId}/${configProfile.modelId})`);
  } else if (envProfile) {
    lines.push(`Remote profile source: env (${envProfile.providerId}/${envProfile.modelId})`);
  } else {
    lines.push('Remote profile source: none');
  }

  if (options.connectivityStatus !== 'online') {
    lines.push('Routing guidance: remote preference may fallback to local while connectivity is not online.');
  }

  if (!configProfile && !envProfile) {
    lines.push('Setup hint: configure remote with `node src/index.ts config remote-llm set ...` if you need online cognition.');
  }

  io.stdout(lines.join('\n'));
  return 0;
}

function safeReadConfigProfile(env: NodeJS.ProcessEnv) {
  try {
    return readRemoteLlmProviderProfileFromConfig(readOverlordUserConfig(env));
  } catch {
    return null;
  }
}

function safeReadEnvProfile(env: NodeJS.ProcessEnv) {
  try {
    return readRemoteLlmProviderProfileFromEnv(env);
  } catch {
    return null;
  }
}

async function probeLocalRuntime(fetchImpl: typeof fetch, baseUrl: string, timeoutMs: number): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}/api/tags`, { signal: controller.signal });
    if (!response.ok) {
      return {
        ok: false,
        reason: `http_${response.status}`,
      };
    }

    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, reason: 'timeout' };
    }

    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
