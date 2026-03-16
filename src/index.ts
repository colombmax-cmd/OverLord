import { SmoosAdapter } from '../adapters/plos/smoos_adapter.ts';
import { InMemoryExecutionProvider } from './adapters/execution/in-memory-provider.ts';
import type { IntentEnvelope } from './models/core.ts';
import { OverlordOrchestrator } from './runtime/orchestrator.ts';

const plos = new SmoosAdapter();
const executionProvider = new InMemoryExecutionProvider();
const orchestrator = new OverlordOrchestrator({ plos, executionProvider });

const intent: IntentEnvelope = {
  id: 'intent-1',
  timestamp: new Date().toISOString(),
  actorId: 'user-1',
  correlationId: 'corr-1',
  schemaVersion: 'v1',
  intentType: 'task.create',
  payload: { title: 'bootstrap overlord runtime' },
};

const result = await orchestrator.processIntent(intent);
console.log(JSON.stringify(result, null, 2));
