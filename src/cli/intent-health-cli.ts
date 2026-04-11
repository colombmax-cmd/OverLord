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
  },
): Promise<number> {
  const env = options.env ?? process.env;
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
    lines.push(`Local runtime base URL: ${(env.OVERLORD_LOCAL_LLM_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '')}`);
    lines.push(`Local runtime model: ${env.OVERLORD_LOCAL_LLM_MODEL ?? 'qwen2.5:1.5b-instruct'}`);
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
