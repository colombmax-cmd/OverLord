import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { OverlordOrchestrator, ProcessIntentResult } from '../runtime/orchestrator.ts';
import type { ConnectivityProbe } from '../cognition/interface.ts';
import type { PlosAdapter } from '../../adapters/plos/interface.ts';
import type { RunTimelineSnapshot } from '../runtime/run-timeline.ts';
import { buildRunTimelineSnapshot } from '../runtime/run-timeline.ts';
import { getDefaultLocalModel, listSupportedRemoteLlmProviders } from '../cognition/model-registry.ts';

interface IntentRunRequestPayload {
  title?: string;
  actorId?: string;
  intentType?: string;
  cognitionPreference?: 'auto' | 'local' | 'remote';
  cognitiveOnly?: boolean;
}

interface WebRunHistoryEntry {
  runId: string;
  createdAt: string;
  payload: IntentRunRequestPayload;
  result: ProcessIntentResult;
}

export interface IntentWebServerDependencies {
  orchestrator: OverlordOrchestrator;
  connectivityProbe: ConnectivityProbe;
  platform: PlosAdapter;
}

export interface IntentWebServerStartOptions {
  port?: number;
}

export async function startIntentWebServer(
  deps: IntentWebServerDependencies,
  options: IntentWebServerStartOptions = {},
): Promise<{ close(): Promise<void>; port: number }> {
  const runHistory: WebRunHistoryEntry[] = [];
  const requestedPort = options.port ?? 8787;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/') {
        respondHtml(res, renderWebAppHtml());
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/health') {
        respondJson(res, {
          connectivity: deps.connectivityProbe.getStatus(),
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/models') {
        const localDefault = getDefaultLocalModel();
        const remoteProviders = listSupportedRemoteLlmProviders().map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          defaultModelId: provider.models.find((model) => model.recommendedDefault)?.modelId ?? provider.models[0]?.modelId ?? 'n/a',
          models: provider.models.map((model) => ({ modelId: model.modelId, displayName: model.displayName })),
        }));

        respondJson(res, {
          localDefaultModelId: localDefault.modelId,
          remoteProviders,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/runs') {
        respondJson(res, {
          runs: runHistory.map((entry) => ({
            runId: entry.runId,
            createdAt: entry.createdAt,
            title: entry.payload.title ?? '',
            outcome: entry.result.outcome,
          })),
        });
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/runs/')) {
        const runId = url.pathname.replace('/api/runs/', '').trim();
        if (!runId) {
          respondJson(res, { error: 'missing run id' }, 400);
          return;
        }

        const events = await deps.platform.readAllEvents();
        const audits = extractAuditRecords(events);
        const timeline = buildRunTimelineSnapshot(runId, events, audits);
        respondJson(res, timeline);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/intent/run') {
        const payload = await readJsonBody(req) as IntentRunRequestPayload;
        const normalized = normalizePayload(payload);
        const result = await deps.orchestrator.processRawIntent({
          actorId: normalized.actorId,
          intentType: normalized.intentType,
          payload: normalized.intentPayload,
        });

        const runId = result.plan?.correlationId ?? findLatestRunId(await deps.platform.readAllEvents()) ?? `run-${Date.now()}`;
        runHistory.unshift({
          runId,
          createdAt: new Date().toISOString(),
          payload,
          result,
        });
        if (runHistory.length > 30) {
          runHistory.length = 30;
        }

        respondJson(res, { runId, result });
        return;
      }

      respondJson(res, { error: 'not_found' }, 404);
    } catch (error) {
      respondJson(res, { error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, '127.0.0.1', () => resolve());
  });

  return {
    port: requestedPort,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function normalizePayload(input: IntentRunRequestPayload): {
  actorId: string;
  intentType: string;
  intentPayload: Record<string, unknown>;
} {
  const title = String(input.title ?? '').trim();
  const actorId = String(input.actorId ?? 'user-1').trim() || 'user-1';
  const intentType = String(input.intentType ?? 'task.create').trim() || 'task.create';
  if (!title) {
    throw new Error('title is required');
  }

  const intentPayload: Record<string, unknown> = { title };
  if (input.cognitionPreference) {
    intentPayload.cognitionPreference = input.cognitionPreference;
  }
  if (input.cognitiveOnly) {
    intentPayload.sessionMode = 'cognitive';
    intentPayload.cognitiveOnly = true;
  }

  return { actorId, intentType, intentPayload };
}

function respondJson(res: ServerResponse, payload: unknown, status = 200): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function respondHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
  });
  res.end(html);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as unknown;
}

function extractAuditRecords(events: Array<{ type: string; payload: unknown }>): Array<{
  ts: string;
  runId: string;
  actorId: string;
  eventType: string;
  decision: 'allow' | 'deny' | 'info';
  reasonCode: string;
  policyVersion: string;
  details: Record<string, unknown>;
}> {
  return events
    .filter((event) => event.type === 'overlord.audit/event_emitted')
    .map((event) => event.payload)
    .filter((payload): payload is Record<string, unknown> => typeof payload === 'object' && payload !== null)
    .map((payload) => ({
      ts: String(payload.ts ?? new Date(0).toISOString()),
      runId: String(payload.runId ?? ''),
      actorId: String(payload.actorId ?? ''),
      eventType: String(payload.eventType ?? ''),
      decision: String(payload.decision ?? 'info') as 'allow' | 'deny' | 'info',
      reasonCode: String(payload.reasonCode ?? ''),
      policyVersion: String(payload.policyVersion ?? 'v1'),
      details: (payload.details ?? {}) as Record<string, unknown>,
    }));
}

function findLatestRunId(events: Array<{ type: string; payload: unknown }>): string | null {
  const audits = extractAuditRecords(events)
    .filter((record) => record.runId.trim().length > 0)
    .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts));
  return audits[0]?.runId ?? null;
}

function renderWebAppHtml(): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Overlord Intent UX (alpha)</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0b1020;color:#f2f4f8}
    .wrap{display:grid;grid-template-columns:300px 1fr 280px;gap:12px;height:100vh;padding:12px;box-sizing:border-box}
    .panel{background:#121a30;border:1px solid #263154;border-radius:10px;padding:12px;overflow:auto}
    h2{margin:0 0 10px;font-size:16px}
    .row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
    input,select,button,textarea{border-radius:8px;border:1px solid #324267;background:#0f162d;color:#f2f4f8;padding:8px}
    textarea{width:100%;min-height:120px;resize:vertical}
    button{cursor:pointer;background:#315efb;border-color:#315efb}
    .badge{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid #4f638f;font-size:12px}
    .muted{color:#92a0c6;font-size:12px}
    .item{padding:8px;border:1px solid #29365b;border-radius:8px;margin-bottom:8px;cursor:pointer}
    pre{white-space:pre-wrap;word-break:break-word;background:#0a1228;border-radius:8px;padding:10px}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="panel">
      <h2>Sessions / Prompts</h2>
      <div id="runs"></div>
    </section>
    <section class="panel">
      <h2>Prompt</h2>
      <div class="row">
        <span class="badge" id="connectivity-badge">connectivity: ...</span>
        <span class="badge" id="routing-badge">route: -</span>
        <span class="badge" id="outcome-badge">outcome: -</span>
      </div>
      <textarea id="title" placeholder="Ex: Préparer la démo alpha"></textarea>
      <div class="row">
        <label class="muted">Preference</label>
        <select id="preference">
          <option value="auto">auto</option>
          <option value="local">local</option>
          <option value="remote">remote</option>
        </select>
        <label class="muted"><input id="cognitive" type="checkbox" /> cognitive-only</label>
        <button id="run-btn">Run</button>
      </div>
      <h2>Résultat</h2>
      <pre id="result"></pre>
      <h2>Timeline / run</h2>
      <pre id="timeline"></pre>
    </section>
    <section class="panel">
      <h2>Options</h2>
      <div id="models" class="muted"></div>
    </section>
  </div>
<script>
  const runsEl = document.getElementById('runs');
  const resultEl = document.getElementById('result');
  const timelineEl = document.getElementById('timeline');
  const connectivityBadge = document.getElementById('connectivity-badge');
  const routingBadge = document.getElementById('routing-badge');
  const outcomeBadge = document.getElementById('outcome-badge');
  const modelsEl = document.getElementById('models');
  const titleEl = document.getElementById('title');
  const preferenceEl = document.getElementById('preference');
  const cognitiveEl = document.getElementById('cognitive');
  const runBtn = document.getElementById('run-btn');

  async function refreshHealth() {
    const response = await fetch('/api/health');
    const data = await response.json();
    connectivityBadge.textContent = 'connectivity: ' + data.connectivity;
  }

  async function refreshModels() {
    const response = await fetch('/api/models');
    const data = await response.json();
    const lines = ['Local default: ' + data.localDefaultModelId, ''];
    for (const provider of data.remoteProviders) {
      lines.push(provider.providerId + ' (default: ' + provider.defaultModelId + ')');
    }
    modelsEl.textContent = lines.join('\\n');
  }

  async function refreshRuns() {
    const response = await fetch('/api/runs');
    const data = await response.json();
    runsEl.innerHTML = '';
    for (const run of data.runs) {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = '<div><strong>' + escapeHtml(run.title || '(sans titre)') + '</strong></div>' +
                      '<div class=\"muted\">' + run.createdAt + ' · ' + run.outcome + '</div>';
      div.onclick = () => loadRunTimeline(run.runId);
      runsEl.appendChild(div);
    }
  }

  async function loadRunTimeline(runId) {
    const response = await fetch('/api/runs/' + encodeURIComponent(runId));
    const data = await response.json();
    timelineEl.textContent = data.entries.map((entry) => entry.at + ' [' + entry.source + '] ' + entry.summary).join('\\n');
  }

  async function runIntent() {
    const payload = {
      title: titleEl.value,
      cognitionPreference: preferenceEl.value,
      cognitiveOnly: cognitiveEl.checked
    };
    const response = await fetch('/api/intent/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      resultEl.textContent = 'Erreur: ' + (data.error || 'unknown');
      return;
    }
    resultEl.textContent = JSON.stringify(data.result, null, 2);
    outcomeBadge.textContent = 'outcome: ' + data.result.outcome;
    const route = data.result.cognition ? (data.result.cognition.fallbackApplied ? ('FALLBACK:' + data.result.cognition.selectedBackend) : data.result.cognition.selectedBackend) : '-';
    routingBadge.textContent = 'route: ' + route;
    await refreshRuns();
    await loadRunTimeline(data.runId);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>\\\"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[char]));
  }

  runBtn.addEventListener('click', runIntent);
  refreshHealth();
  refreshModels();
  refreshRuns();
</script>
</body>
</html>`;
}
