import { SmoosAdapter } from '../adapters/plos/smoos_adapter.ts';
import { createSmoosDependencyAdapter } from '../adapters/plos/smoos_dependency_adapter.ts';
import { InMemoryExecutionProvider } from './adapters/execution/in-memory-provider.ts';
import { EnvironmentConnectivityProbe } from './cognition/connectivity.ts';
import { runIntentHealthCli } from './cli/intent-health-cli.ts';
import { runIntentCli } from './cli/intent-cli.ts';
import { runRemoteLlmConfigCli } from './cli/remote-llm-config.ts';
import type { PlosEvent, RuntimeAuditRecord } from './ports/plos.ts';
import { buildRunTimelineSnapshot } from './runtime/run-timeline.ts';
import { OverlordOrchestrator } from './runtime/orchestrator.ts';

const args = process.argv.slice(2);
if (args[0] === 'config' && args[1] === 'remote-llm') {
  try {
    process.exitCode = await runRemoteLlmConfigCli(args.slice(2), {
      stdout: (message) => console.log(message),
      stderr: (message) => console.error(message),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else {
  const platform = process.env.OVERLORD_USE_LOCAL_SMOOS === '1'
    ? new SmoosAdapter()
    : await createSmoosDependencyAdapter({
        moduleName: process.env.SMOOS_PACKAGE,
        exportName: process.env.SMOOS_EXPORT_NAME,
      });

  const executionProvider = new InMemoryExecutionProvider();
  const orchestrator = new OverlordOrchestrator({ platform, executionProvider });
  const connectivityProbe = new EnvironmentConnectivityProbe();

  if (args[0] === 'intent' && args[1] === 'run') {
    process.exitCode = await runIntentCli(args.slice(2), {
      stdout: (message) => console.log(message),
      stderr: (message) => console.error(message),
    }, {
      executeIntent: (rawIntent) => orchestrator.processRawIntent(rawIntent),
      readTimeline: async (result) => {
        const events = await platform.readAllEvents();
        const audits = extractAuditRecords(events);
        const runId = resolveRunId(result, audits);
        if (!runId) {
          return null;
        }

        return buildRunTimelineSnapshot(runId, events, audits);
      },
    });
  } else if (args[0] === 'intent' && args[1] === 'health') {
    process.exitCode = await runIntentHealthCli({
      stdout: (message) => console.log(message),
      stderr: (message) => console.error(message),
    }, {
      connectivityStatus: connectivityProbe.getStatus(),
    });
  } else {
    const result = await orchestrator.processRawIntent({
      actorId: 'user-1',
      intentType: 'task.create',
      payload: { title: 'bootstrap overlord runtime' },
    });

    console.log(JSON.stringify(result, null, 2));
  }
}

function extractAuditRecords(events: PlosEvent[]): RuntimeAuditRecord[] {
  return events
    .filter((event) => event.type === 'overlord.audit/event_emitted')
    .map((event) => event.payload)
    .filter((payload): payload is Record<string, unknown> => typeof payload === 'object' && payload !== null)
    .map((payload) => ({
      ts: String(payload.ts ?? new Date(0).toISOString()),
      runId: String(payload.runId ?? ''),
      actorId: String(payload.actorId ?? ''),
      eventType: String(payload.eventType ?? ''),
      decision: String(payload.decision ?? 'info') as RuntimeAuditRecord['decision'],
      reasonCode: String(payload.reasonCode ?? ''),
      policyVersion: String(payload.policyVersion ?? 'v1'),
      details: (payload.details ?? {}) as Record<string, unknown>,
    }));
}

function resolveRunId(result: Awaited<ReturnType<OverlordOrchestrator['processRawIntent']>>, audits: RuntimeAuditRecord[]): string | null {
  if (result.plan?.correlationId) {
    return result.plan.correlationId;
  }

  const latest = [...audits]
    .filter((record) => record.runId.trim().length > 0)
    .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))[0];

  return latest?.runId ?? null;
}
