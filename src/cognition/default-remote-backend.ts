import { readOverlordUserConfig } from '../config/user-config.ts';
import { DefaultSecretResolver } from '../secrets/default-resolver.ts';
import type { CognitionBackend } from './interface.ts';
import { readRemoteLlmProviderProfileFromConfig, readRemoteLlmProviderProfileFromEnv } from './provider-config.ts';
import { DeterministicRemoteCognitionBackend } from './remote-backend.ts';
import { RemoteLlmCognitionBackend } from './remote-llm-backend.ts';

export function createDefaultRemoteCognitionBackend(env: NodeJS.ProcessEnv = process.env): CognitionBackend {
  const remoteLlmProfile = readRemoteLlmProviderProfileFromConfig(readOverlordUserConfig(env))
    ?? readRemoteLlmProviderProfileFromEnv(env);
  if (remoteLlmProfile) {
    return new RemoteLlmCognitionBackend({
      profile: remoteLlmProfile,
      secretResolver: new DefaultSecretResolver(env),
    });
  }

  return new DeterministicRemoteCognitionBackend();
}
