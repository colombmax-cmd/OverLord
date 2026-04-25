import type { RuntimeAuditRecord } from '../../adapters/plos/interface.ts';
import type { PlosEvent } from '../ports/plos.ts';

export interface RunTimelineEntry {
  at: string;
  source: 'audit' | 'event';
  type: string;
  summary: string;
}

export interface RunTimelineSnapshot {
  correlationId: string;
  entries: RunTimelineEntry[];
}

function normalizeTimestamp(value: unknown): string {
  const asString = String(value ?? '');
  if (Number.isFinite(Date.parse(asString))) {
    return new Date(asString).toISOString();
  }

  return new Date(0).toISOString();
}

function summarizeAudit(record: RuntimeAuditRecord): string {
  if (record.eventType === 'overlord.cognition_decided') {
    const backend = String(record.details?.backendKind ?? 'unknown');
    const proposal = String(record.details?.proposalType ?? 'unknown');
    return `${record.eventType}: backend=${backend}, proposal=${proposal}`;
  }

  if (record.eventType === 'overlord.workflow_completed') {
    const workflowId = String(record.details?.workflowId ?? 'n/a');
    const state = String(record.details?.state ?? 'n/a');
    return `${record.eventType}: workflowId=${workflowId}, state=${state}`;
  }

  return record.eventType;
}

function summarizeEvent(event: PlosEvent): string {
  if (event.type.startsWith('overlord.workflow/')) {
    const state = String((event.payload as Record<string, unknown>).state ?? 'unknown');
    return `${event.type}: state=${state}`;
  }

  if (event.type === 'overlord.plan/generated') {
    const payload = event.payload as Record<string, unknown>;
    return `${event.type}: planHash=${String(payload.planHash ?? 'n/a')}`;
  }

  return event.type;
}

export function buildRunTimelineSnapshot(
  correlationId: string,
  events: PlosEvent[],
  audits: RuntimeAuditRecord[],
): RunTimelineSnapshot {
  const auditEntries: RunTimelineEntry[] = audits
    .filter((record) => record.runId === correlationId)
    .map((record) => ({
      at: normalizeTimestamp(record.ts),
      source: 'audit',
      type: record.eventType,
      summary: summarizeAudit(record),
    }));

  const eventEntries: RunTimelineEntry[] = events
    .filter((event) => {
      const payload = event.payload as Record<string, unknown>;
      return payload.correlationId === correlationId || payload.runId === correlationId || event.entityId === correlationId;
    })
    .map((event) => ({
      at: normalizeTimestamp(new Date(event.timestamp).toISOString()),
      source: 'event',
      type: event.type,
      summary: summarizeEvent(event),
    }));

  const entries = [...auditEntries, ...eventEntries].sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  );

  return { correlationId, entries };
}
