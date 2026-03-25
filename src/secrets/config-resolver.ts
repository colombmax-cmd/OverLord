import type { SecretResolver } from '../ports/secrets.ts';
import { getOverlordConfigPaths, readOverlordSecretsConfig } from '../config/user-config.ts';

const CONFIG_SECRET_PREFIX = 'config:';

export class ConfigSecretResolver implements SecretResolver {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  async resolve(secretRef: string): Promise<string> {
    if (!secretRef.startsWith(CONFIG_SECRET_PREFIX)) {
      throw new Error(`unsupported secret ref: ${secretRef}`);
    }

    const secretName = parseConfigSecretName(secretRef);
    const secrets = readOverlordSecretsConfig(this.env);
    const secretValue = secrets?.[secretName];
    if (!secretValue) {
      const paths = getOverlordConfigPaths(this.env);
      throw new Error(`missing config secret: ${secretName} in ${paths.secretsFile}`);
    }

    return secretValue;
  }
}

function parseConfigSecretName(secretRef: string): string {
  const secretName = secretRef.slice(CONFIG_SECRET_PREFIX.length).trim().toLowerCase();
  if (!secretName || !/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(secretName)) {
    throw new Error(`invalid config secret ref: ${secretRef}`);
  }

  return secretName.replace(/-/g, '_');
}
