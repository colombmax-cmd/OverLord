import { SmoosAdapter } from '../adapters/plos/smoos_adapter.js';
import { createSmoosDependencyAdapter } from '../adapters/plos/smoos_dependency_adapter.js';
import { InMemoryExecutionProvider } from './adapters/execution/in-memory-provider.js';
import { OverlordOrchestrator } from './runtime/orchestrator.js';

const plos = process.env.OVERLORD_USE_LOCAL_SMOOS === '1'
  ? new SmoosAdapter()
  : await createSmoosDependencyAdapter({
      moduleName: process.env.SMOOS_PACKAGE,
      exportName: process.env.SMOOS_EXPORT_NAME,
    });

const executionProvider = new InMemoryExecutionProvider();
const orchestrator = new OverlordOrchestrator({ plos, executionProvider });

const result = await orchestrator.processRawIntent({
  actorId: 'user-1',
  intentType: 'task.create',
  payload: { title: 'bootstrap overlord runtime' },
});

console.log(JSON.stringify(result, null, 2));
