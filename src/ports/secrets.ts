export interface SecretResolver {
  resolve(secretRef: string): Promise<string>;
}
