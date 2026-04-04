import crypto from 'node:crypto';

import type { IntentEnvelope } from '../models/core.ts';
import { IntentValidationError } from './errors.ts';

const SUPPORTED_SCHEMA_VERSION = 'v1';

export interface RawIntentInput {
  id?: unknown;
  timestamp?: unknown;
  actorId?: unknown;
  correlationId?: unknown;
  schemaVersion?: unknown;
  intentType?: unknown;
  payload?: unknown;
}

export class IntentGateway {
  normalize(raw: RawIntentInput): IntentEnvelope {
    const actorId = this.assertNonEmptyString(raw.actorId, 'actorId');
    const intentType = this.assertNonEmptyString(raw.intentType, 'intentType');

    const schemaVersion = raw.schemaVersion ?? SUPPORTED_SCHEMA_VERSION;
    if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      throw new IntentValidationError(
        'INTENT_INVALID_SCHEMA_VERSION',
        `unsupported schema version '${String(schemaVersion)}'`,
        { expected: SUPPORTED_SCHEMA_VERSION, received: schemaVersion },
      );
    }

    if (!this.isRecord(raw.payload)) {
      throw new IntentValidationError('INTENT_INVALID_PAYLOAD', 'payload must be an object', {
        receivedType: typeof raw.payload,
      });
    }

    const idSeed = {
      actorId,
      intentType,
      schemaVersion,
      payload: raw.payload,
    };
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : this.generateDeterministicId('intent', idSeed);
    const timestamp =
      typeof raw.timestamp === 'string' && raw.timestamp.trim() ? raw.timestamp : new Date().toISOString();
    const correlationId =
      typeof raw.correlationId === 'string' && raw.correlationId.trim()
        ? raw.correlationId
        : this.generateDeterministicId('corr', idSeed);

    return {
      id,
      timestamp,
      actorId,
      correlationId,
      schemaVersion,
      intentType,
      payload: raw.payload,
    };
  }

  private assertNonEmptyString(value: unknown, field: string): string {
    if (typeof value !== 'string') {
      throw new IntentValidationError('INTENT_INVALID_TYPE', `${field} must be a string`, {
        field,
        receivedType: typeof value,
      });
    }

    if (!value.trim()) {
      throw new IntentValidationError('INTENT_MISSING_FIELD', `${field} is required`, { field });
    }

    return value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private generateDeterministicId(prefix: string, seed: Record<string, unknown>): string {
    const digest = crypto.createHash('sha256').update(this.stableStringify(seed)).digest('hex');
    return `${prefix}-${digest.slice(0, 16)}`;
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${this.stableStringify(entry)}`).join(',')}}`;
  }
}
