export class PlosAccessDeniedError extends Error {
  readonly capability: string;
  readonly reason: string;

  constructor(capability: string, reason: string) {
    super(`PLOS access denied (${capability}): ${reason}`);
    this.name = 'PlosAccessDeniedError';
    this.capability = capability;
    this.reason = reason;
  }
}
