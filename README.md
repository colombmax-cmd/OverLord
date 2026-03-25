# Overlord

Overlord is a cognitive orchestration runtime aligned with the PLOS standard.

It is designed to integrate with Smo.OS as a memory/capability backend,
while remaining an independent orchestration solution that can be replaced
by other cognitive orchestrators.

## Positioning

Overlord is **not** Smo.OS.

- **Smo.OS / PLOS** provides memory, identity, permissions, and audit primitives.
- **Overlord** consumes those primitives to interpret intent, build workflow plans,
  and delegate execution.

This separation is intentional: a user can keep Smo.OS and swap orchestrators,
or keep Overlord and use another compatible PLOS implementation.

## Architecture

User
↓
Overlord (Cognitive Orchestrator)
↓
Memory access request
↓
MAL in Smo.OS / PLOS backend (authoritative enforcement)
↓
Filtered memory view
↓
Cognitive Agent
↓
Workflow proposal
↓
Overlord validation
↓
Execution Provider (Temporal or other)
↓
Action Agents

## Responsibilities

Overlord:
- interprets user intent
- requests scoped memory access and validates policy intent
- runs an offline-first local cognitive backend with a supported model registry
- builds workflow plans
- delegates execution
- generates audit events, including cognitive decisions and significant exchanges

Note: authoritative access enforcement remains in MAL (inside Smo.OS/PLOS), not in Overlord.

## Non-goals

Overlord does not:
- store personal memory
- execute workflows directly
- replace workflow engines
- become coupled to a single memory product

## Related projects

Smo.OS – personal memory layer
Agents – specialized workers (to come)

## Technical scope

See `doc/technical-scope.md` for the implementation boundary and MVP technical blueprint (interfaces, runtime components, control flow, and done criteria).

## Smo.OS dependency mode

Overlord now targets the Smo.OS git dependency directly:

```bash
npm install git+https://github.com/colombmax-cmd/Smo.OS.git
npm run dev
```

Default runtime behavior:
- `src/index.ts` loads the installed `smo-os` package by default.
- for the git-installed Smo.OS repository, Overlord bridges directly to the installed source tree and reuses Smo.OS log + MAL primitives.
- if needed, `SMOOS_PACKAGE` can point to another compatible package or subpath.
- if needed, `SMOOS_EXPORT_NAME` can force a specific export.
- `OVERLORD_USE_LOCAL_SMOOS=1` switches back to the in-repo `SmoosAdapter` stub for offline development.


## Current capabilities

Overlord now includes an offline-first cognitive backend path for local planning:
- supported local models are declared in a registry (`src/cognition/model-registry.ts`)
- the default supported model is `Qwen/Qwen2.5-1.5B-Instruct`
- connectivity is tracked separately from cognition so future online routing can be added without changing the orchestrator contract
- PLOS events and audits now capture cognitive decisions plus significant exchange summaries
- Phase B adds hybrid routing so Overlord can prefer a remote cognition backend when online, while preserving local-first fallback and explicit no-action when remote cognition is mandatory but unavailable
- Phase Online-Prep adds an env-configured remote-LLM backend with a multi-provider catalogue (`xai`, `openai`), product-style secret refs by default (`product:xai_api_key`, `product:openai_api_key`) with env/file fallback support, and opt-in live smoke tests guarded by `RUN_LIVE_LLM_TESTS=1`
- user intent can now override the remote-LLM provider/model selection through `payload.remoteLlm` (or `remoteLlmProvider` / `remoteLlmModel`) while still falling back to the selected provider defaults
- remote-LLM can also be configured through the product CLI and persisted in `~/.config/overlord/{config,secrets}.json` (or `OVERLORD_CONFIG_DIR`) without requiring provider/model/secret env vars at runtime


For precedence, file locations, validation rules, and live-smoke notes, see [`doc/remote-llm-configuration.md`](./doc/remote-llm-configuration.md).

## Documentation

Project documentation is organized under [`doc/`](./doc/README.md).

MVP Core delivery roadmap: [`doc/mvp-core-roadmap.md`](./doc/mvp-core-roadmap.md).

Conformance tests architecture: [`doc/conformance-architecture.md`](./doc/conformance-architecture.md).

## Getting started (MVP scaffold)

```bash
npm install
npm test
npm run test:conformance
npm run dev
```

## Remote-LLM configuration CLI

Persist a remote provider/model/secret locally:

```bash
node src/index.ts config remote-llm set \
  --provider xai \
  --model grok-4.20-beta-latest-non-reasoning \
  --api-key "$XAI_API_KEY"
```

Inspect the persisted non-secret profile:

```bash
node src/index.ts config remote-llm show
```
