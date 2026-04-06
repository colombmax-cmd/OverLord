# Alpha Runbook (Sprint 2)

## Quickstart (local cognitive-first)

```bash
npm install
npm test -- --runInBand --test-name-pattern="phase"
node src/index.ts
```

Expected result:
- one intent is normalized, authorized via PLOS memory view, and routed to cognition;
- cognition returns one of: `proposal`, `clarification`, `scope_request`, `no_action`;
- audit events are appended with one correlation/run id.

## Remote demo quickstart

Configure remote provider:

```bash
node src/index.ts config remote-llm set \
  --provider xai \
  --model grok-4.20-beta-latest-non-reasoning \
  --api-key "$XAI_API_KEY"
```

Then run with remote preference in payload (`cognitionPreference: "remote"`).

Fallback behavior:
- if remote is unavailable and remote is optional, Overlord falls back to local and records the explicit route reason;
- if remote is mandatory (`requiresRemoteCognition: true`) and unavailable, Overlord returns `no_action`.

## Timeline / traceability checklist

For a single run (`correlationId`):
- verify audit continuity (`runId` is stable across intent → cognition → planning/execution);
- reconstruct ordered timeline entries from events + audits;
- confirm that `overlord.intent_received` appears before `overlord.workflow_completed` on execution paths.

## Known limitations (alpha)

- no front-end UX shell yet (CLI/dev runtime only);
- live remote smoke tests depend on valid provider keys and may fail with expired credentials;
- cognitive session mode is available, but external agent execution UX is intentionally out of scope in alpha.
