import { SmoosAdapter, type SmoosAdapterOptions } from '../../../adapters/plos/smoos_adapter.ts';
import { InMemoryExecutionProvider } from '../../../src/adapters/execution/in-memory-provider.ts';
import { IntentGateway, type RawIntentInput } from '../../../src/intent/gateway.ts';
import { OverlordOrchestrator } from '../../../src/runtime/orchestrator.ts';

export interface ConformanceHarnessOptions {
  adapter?: SmoosAdapterOptions;
}

export function buildConformanceHarness(options: ConformanceHarnessOptions = {}) {
  const plos = new SmoosAdapter(options.adapter);
  const executionProvider = new InMemoryExecutionProvider();
  const intentGateway = new IntentGateway();
  const orchestrator = new OverlordOrchestrator({ plos, executionProvider, intentGateway });

  return { plos, executionProvider, intentGateway, orchestrator };
}

export function validRawIntent(overrides: Partial<RawIntentInput> = {}): RawIntentInput {
  return {
    actorId: 'conformance-user',
    intentType: 'task.create',
    payload: { title: 'conformance intent' },
    ...overrides,
  };
}
