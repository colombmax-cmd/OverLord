# Conformance Test Architecture

This architecture defines how Overlord validates functional conformance across MVP phases.

## Principles

- **One test folder per phase** (`test/conformance/phaseN`).
- **Shared base** (`test/conformance/shared`) for fixtures/harnesses.
- **Phase gate**: a phase is valid only when its conformance tests pass.
- **Contract-first**: tests validate interface invariants, not internal implementation details.

## Tree

```txt
test/
  conformance/
    shared/
      fixtures.ts
    phase0/
      runtime.conformance.test.ts
    phase1/
      intent-gateway.conformance.test.ts
    phase2/
      policy-capability-guard.conformance.test.ts
    phase3/
      planning.conformance.test.ts
    phase4/
      execution-freeze.conformance.test.ts
```

## Coverage currently implemented

### Phase 0 — runtime baseline
- Baseline end-to-end execution via `processRawIntent`.
- Verification of generated audits and final workflow state.

### Phase 1 — intent gateway
- Intent schema/version validation.
- Normalization (default schema version + correlation ID generation).
- Structured failures through `IntentValidationError`.

### Phase 2 — policy/capability guard
- Overlord policy requests are sent to MAL/PLOS for authoritative checks.
- Deny-by-default behavior is enforced by MAL when required capability is missing.
- Denial audit emission (`capability_denied`).

### Phase 3 — planning branches
- Proposal/clarification/scope-request/no-action branch correctness.
- Plan generation determinism expectations for fixed inputs.
- Route-aware cognition metadata propagation.

### Phase 4 — execution freeze and transitions
- Freeze metadata integrity (`version`, hash, deterministic freezing).
- Submission transition coverage (`submitted` -> terminal states).
- Event sequencing expectations between planning/execution/audit layers.

## Runtime-level complements (outside `test/conformance/`)

In addition to strict conformance suites, Overlord uses runtime-oriented tests for:
- remote-LLM provider/profile selection behavior,
- persisted remote-LLM config CLI (`set`/`show`) and secret resolution,
- remote response parsing hardening (fenced JSON, malformed JSON, HTTP failures),
- live-smoke remote reachability gated by explicit env opt-in.

These are intentionally adjacent to conformance tests because they validate operational behavior and integration surfaces rather than pure phase contracts.

## Recommended evolution

- Add **Phase 5** conformance for traceability/audit integrity invariants.
- Add **Phase 6** portability conformance with at least two adapter/provider implementations.
- Add a compact matrix mapping MVP done criteria to conformance + runtime test files.
