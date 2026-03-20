import { readFile } from 'node:fs/promises';

import type { SecretResolver } from '../ports/secrets.ts';

const ENV_SECRET_PREFIX = 'env:';
const PRODUCT_SECRET_PREFIX = 'product:';
const PRODUCT_SECRET_ENV_PREFIX = 'OVERLORD_SECRET_';
const DEFAULT_PRODUCT_SECRET_ENV_ALIASES: Record<string, string> = {
  xai_api_key: 'XAI_API_KEY',
  openai_api_key: 'OPENAI_API_KEY',
};

export class EnvironmentSecretResolver implements SecretResolver {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  async resolve(secretRef: string): Promise<string> {
    if (secretRef.startsWith(ENV_SECRET_PREFIX)) {
      return this.resolveEnvSecret(secretRef);
    }

    if (secretRef.startsWith(PRODUCT_SECRET_PREFIX)) {
      return this.resolveProductSecret(secretRef);
    }

    throw new Error(`unsupported secret ref: ${secretRef}`);
  }

  private resolveEnvSecret(secretRef: string): string {
    const envVarName = this.parseEnvVarName(secretRef.slice(ENV_SECRET_PREFIX.length), secretRef);
    const value = this.env[envVarName];
    if (!value) {
      throw new Error(`missing environment secret: ${envVarName}`);
    }

    return value;
  }

  private async resolveProductSecret(secretRef: string): Promise<string> {
    const secretName = this.parseProductSecretName(secretRef);
    const envSuffix = toEnvSuffix(secretName);

    const directValue = this.env[`${PRODUCT_SECRET_ENV_PREFIX}${envSuffix}`];
    if (directValue) {
      return directValue;
    }

    const filePath = this.env[`${PRODUCT_SECRET_ENV_PREFIX}${envSuffix}_FILE`];
    if (filePath?.trim()) {
      const value = await readFile(filePath.trim(), 'utf8');
      const normalized = value.replace(/[\r\n]+$/, '');
      if (!normalized) {
        throw new Error(`mounted product secret is empty: ${secretName}`);
      }

      return normalized;
    }

    const delegatedEnvVarName = this.env[`${PRODUCT_SECRET_ENV_PREFIX}${envSuffix}_ENV`]
      ?? DEFAULT_PRODUCT_SECRET_ENV_ALIASES[secretName];
    if (delegatedEnvVarName) {
      const envVarName = this.parseEnvVarName(delegatedEnvVarName, secretRef);
      const value = this.env[envVarName];
      if (!value) {
        throw new Error(`missing environment secret: ${envVarName}`);
      }

      return value;
    }

    throw new Error(`missing product secret: ${secretName}`);
  }

  private parseEnvVarName(rawName: string, secretRef: string): string {
    const envVarName = rawName.trim();
    if (!envVarName || !/^[A-Z_][A-Z0-9_]*$/i.test(envVarName)) {
      throw new Error(`invalid environment secret ref: ${secretRef}`);
    }

    return envVarName;
  }

  private parseProductSecretName(secretRef: string): string {
    const secretName = secretRef.slice(PRODUCT_SECRET_PREFIX.length).trim().toLowerCase();
    if (!secretName || !/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(secretName)) {
      throw new Error(`invalid product secret ref: ${secretRef}`);
    }

    return secretName.replace(/-/g, '_');
  }
}

function toEnvSuffix(secretName: string): string {
  return secretName.replace(/[^a-z0-9]+/gi, '_').toUpperCase();
}
