import type { SecretResolver } from '../ports/secrets.ts';
import { ConfigSecretResolver } from './config-resolver.ts';
import { EnvironmentSecretResolver } from './env-resolver.ts';

export class DefaultSecretResolver implements SecretResolver {
  private readonly configResolver: ConfigSecretResolver;
  private readonly envResolver: EnvironmentSecretResolver;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.configResolver = new ConfigSecretResolver(env);
    this.envResolver = new EnvironmentSecretResolver(env);
  }

  async resolve(secretRef: string): Promise<string> {
    if (secretRef.startsWith('config:')) {
      return this.configResolver.resolve(secretRef);
    }

    return this.envResolver.resolve(secretRef);
  }
}
