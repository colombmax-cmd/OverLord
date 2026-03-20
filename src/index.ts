import { SmoosAdapter } from '../adapters/plos/smoos_adapter.ts';
import { createSmoosDependencyAdapter } from '../adapters/plos/smoos_dependency_adapter.ts';
import { InMemoryExecutionProvider } from './adapters/execution/in-memory-provider.ts';
import { runRemoteLlmConfigCli } from './cli/remote-llm-config.ts';
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

  const result = await orchestrator.processRawIntent({
    actorId: 'user-1',
    intentType: 'task.create',
    payload: { title: 'bootstrap overlord runtime' },
  });

  console.log(JSON.stringify(result, null, 2));
}
