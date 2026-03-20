export type IntentValidationCode =
  | 'INTENT_INVALID_TYPE'
  | 'INTENT_MISSING_FIELD'
  | 'INTENT_INVALID_SCHEMA_VERSION'
  | 'INTENT_INVALID_PAYLOAD';

export class IntentValidationError extends Error {
  readonly code: IntentValidationCode;
  readonly details: Record<string, unknown>;

  constructor(code: IntentValidationCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'IntentValidationError';
    this.code = code;
    this.details = details;
  }
}
