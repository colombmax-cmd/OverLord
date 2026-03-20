import { EnvironmentSecretResolver } from '../secrets/env-resolver.ts';
import type { CognitionBackend } from './interface.ts';
import { readRemoteLlmProviderProfileFromEnv } from './provider-config.ts';
import { DeterministicRemoteCognitionBackend } from './remote-backend.ts';
import { RemoteLlmCognitionBackend } from './remote-llm-backend.ts';

export function createDefaultRemoteCognitionBackend(env: NodeJS.ProcessEnv = process.env): CognitionBackend {
  const remoteLlmProfile = readRemoteLlmProviderProfileFromEnv(env);
  if (remoteLlmProfile) {
    return new RemoteLlmCognitionBackend({
      profile: remoteLlmProfile,
      secretResolver: new EnvironmentSecretResolver(env),
    });
  }

  return new DeterministicRemoteCognitionBackend();
}
