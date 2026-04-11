import type { ProcessIntentResult } from '../runtime/orchestrator.ts';
import type { RunTimelineSnapshot } from '../runtime/run-timeline.ts';

export interface IntentCliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface IntentCliDeps {
  executeIntent(rawIntent: {
    actorId: string;
    intentType: string;
    payload: Record<string, unknown>;
  }): Promise<ProcessIntentResult>;
  readTimeline?(result: ProcessIntentResult): Promise<RunTimelineSnapshot | null>;
}

export async function runIntentCli(
  args: string[],
  io: IntentCliIo,
  deps: IntentCliDeps,
): Promise<number> {
  try {
    const flags = parseFlags(args);
    const actorId = flags['actor-id'] ?? 'user-1';
    const intentType = flags['intent-type'] ?? 'task.create';
    const outputMode = (flags.output ?? 'pretty').toLowerCase();
    if (outputMode !== 'pretty' && outputMode !== 'json') {
      io.stderr(`invalid --output value: ${flags.output}. Expected pretty|json`);
      io.stderr(renderUsage());
      return 1;
    }

    const payload = buildPayload(flags);
    const result = await deps.executeIntent({ actorId, intentType, payload });

    if (outputMode === 'json') {
      io.stdout(JSON.stringify(result, null, 2));
      return 0;
    }

    io.stdout(renderPrettyResult(result));
    if (parseBoolean(flags['show-timeline'])) {
      const timeline = await deps.readTimeline?.(result);
      if (timeline) {
        io.stdout('');
        io.stdout(renderTimeline(timeline));
      } else {
        io.stdout('');
        io.stdout('Timeline: unavailable');
      }
    }
    return 0;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    io.stderr(renderUsage());
    return 1;
  }
}

function parseFlags(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  throw new Error(`invalid boolean value: ${value}. Expected true|false|1|0`);
}

function buildPayload(flags: Record<string, string>): Record<string, unknown> {
  const title = flags.title?.trim();
  const noAction = parseBoolean(flags['no-action']);
  const cognitiveOnly = parseBoolean(flags['cognitive-only']);

  if (!title && !noAction) {
    throw new Error('missing required flag --title (unless --no-action true)');
  }

  const payload: Record<string, unknown> = {};
  if (title) {
    payload.title = title;
  }

  if (flags['required-capability']) {
    payload.requiredCapability = flags['required-capability'];
  }

  if (noAction) {
    payload.noAction = true;
  }

  if (cognitiveOnly) {
    payload.sessionMode = 'cognitive';
    payload.cognitiveOnly = true;
  }

  const preference = flags['cognition-preference'];
  if (preference === 'local' || preference === 'remote' || preference === 'auto') {
    payload.cognitionPreference = preference;
  } else if (preference) {
    throw new Error(`invalid --cognition-preference value: ${preference}. Expected local|remote|auto`);
  }

  return payload;
}

function renderPrettyResult(result: ProcessIntentResult): string {
  const lines = [
    'Overlord Intent Result',
    '======================',
    `Outcome: ${result.outcome}`,
  ];

  if (result.outcome === 'proposal') {
    lines.push(`Plan hash: ${result.plan?.planHash ?? 'n/a'}`);
    lines.push(`Steps: ${result.steps?.length ?? 0}`);
  } else if (result.outcome === 'workflow_submitted') {
    lines.push(`Workflow: ${result.workflowId ?? 'n/a'} (${result.workflowState ?? 'unknown'})`);
    lines.push(`Plan hash: ${result.plan?.planHash ?? 'n/a'}`);
  } else if (result.outcome === 'clarification_required') {
    lines.push(`Clarification: ${result.clarificationQuestion ?? 'n/a'}`);
  } else if (result.outcome === 'scope_request') {
    lines.push(`Missing capability: ${result.missingCapability ?? 'n/a'}`);
  } else if (result.outcome === 'no_action') {
    lines.push(`Reason: ${result.reason ?? 'n/a'}`);
  }

  if (result.cognition) {
    lines.push('');
    lines.push('Cognition');
    lines.push('---------');
    lines.push(`Backend: ${result.cognition.selectedBackend} (${result.cognition.backendKind})`);
    lines.push(`Model: ${result.cognition.modelId}`);
    lines.push(`Route: ${result.cognition.routeReason}`);
    if (result.cognition.fallbackApplied) {
      lines.push(`Fallback: yes (${result.cognition.fallbackReason ?? result.cognition.routeReason})`);
    }
  }

  return lines.join('\n');
}

function renderUsage(): string {
  return [
    'Usage:',
    '  node src/index.ts intent run --title <text> [--actor-id <id>] [--intent-type <type>]',
    '    [--cognitive-only true|false] [--no-action true|false]',
    '    [--required-capability <capability>] [--cognition-preference <auto|local|remote>]',
    '    [--output pretty|json] [--show-timeline true|false]',
  ].join('\n');
}

function renderTimeline(snapshot: RunTimelineSnapshot): string {
  const lines = [
    `Run Timeline (${snapshot.correlationId})`,
    '------------------------------',
  ];

  for (const entry of snapshot.entries) {
    lines.push(`${entry.at} [${entry.source}] ${entry.type}`);
  }

  return lines.join('\n');
}
