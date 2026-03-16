import { SmoosAdapter } from '../adapters/plos/smoos_adapter.ts';
import { InMemoryExecutionProvider } from './adapters/execution/in-memory-provider.ts';
import { OverlordOrchestrator } from './runtime/orchestrator.ts';

const plos = new SmoosAdapter();
const executionProvider = new InMemoryExecutionProvider();
const orchestrator = new OverlordOrchestrator({ plos, executionProvider });

const result = await orchestrator.processRawIntent({
  actorId: 'user-1',
  intentType: 'task.create',
  payload: { title: 'bootstrap overlord runtime' },
});

console.log(JSON.stringify(result, null, 2));
