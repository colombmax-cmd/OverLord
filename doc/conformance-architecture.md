# Conformance Test Architecture

This architecture defines how Overlord validates functional conformance at each MVP phase.

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
```

## Coverage currently implemented

### Phase 0
- Baseline E2E execution via `processRawIntent`.
- Verification of generated audits and final workflow state.

### Phase 1
- Intent schema/version validation.
- Normalization (default schema version + correlation ID generation).
- Structured failures through `IntentValidationError`.

### Phase 2
- Overlord policy requests are sent to MAL/PLOS for authoritative checks.
- Deny-by-default behavior is enforced by MAL when required capability is missing.
- Denial audit emission (`capability_denied`).

## Recommended evolution

- Add `phase3/` for planning branches + determinism.
- Add `phase4/` for execution transitions/freeze.
- Add `phase5/` for traceability/audit integrity.
- Add `phase6/` for portability conformance (2 adapter/provider implementations).
