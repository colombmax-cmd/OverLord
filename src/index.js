import { SmoosAdapter } from '../adapters/plos/smoos_adapter.js';
import { InMemoryExecutionProvider } from './adapters/execution/in-memory-provider.js';
import { OverlordOrchestrator } from './runtime/orchestrator.js';

const plos = new SmoosAdapter();
const executionProvider = new InMemoryExecutionProvider();
const orchestrator = new OverlordOrchestrator({ plos, executionProvider });

const intent = {
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
