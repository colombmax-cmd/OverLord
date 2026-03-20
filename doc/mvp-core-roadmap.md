# Overlord MVP Core Roadmap (Reference)

This document is the delivery reference for building the Overlord MVP Core.

## MVP Vision

Deliver a runtime able to process **one intent family** end-to-end, with:
- capability checks before protected operations,
- submission/monitoring through an execution adapter,
- traceable audit events for major transitions,
- portable architecture (interchangeable memory backend/provider).

> Aligned with `doc/technical-scope.md` sections 4, 8, and 9.

---

## Phase 0 — Baseline Stabilization (TypeScript)

### Objective
Establish a consistent developer baseline with TypeScript as the source of truth.

### Scope
- Unify dev/test scripts on `.ts` files.
- Prevent JS/TS logic drift.
- Verify local flow works (`npm test`, `npm run dev`).

### Done criteria
- Runtime imports target TypeScript modules.
- Default test execution targets TS paths.
- Intent -> plan -> execution -> audit flow remains green.

---

## Phase 1 — Intent Gateway

### Objective
Implement robust intent intake (validation + normalization).

### Deliverables
- Strict `IntentEnvelope` validation.
- Schema version management.
- Correlation ID assignment/propagation.
- Structured error responses.

### Done criteria
- Tests: invalid payload, invalid version, valid intent.

---

## Phase 2 — Policy Requesting + MAL Enforcement Alignment

### Objective
Guarantee closed-by-default access while keeping enforcement in MAL/PLOS.

### Deliverables
- Overlord-side component that plans memory access requests from intent.
- MAL/PLOS-side enforcement for protected memory operations.
- Authorization audits for allow/deny outcomes returned by MAL.

### Done criteria
- Overlord never acts as final memory authorization authority.
- Denial-path and denial-audit tests validate MAL-enforced failures.

---

## Phase 3 — Planning Engine + Clarification Loop

### Objective
Move from static planning to an MVP planning engine.

### Deliverables
- Structured plan proposal generation.
- Branches: `proposal`, `clarification`, `scope_request`, `no_action`.
- Deterministic planning rules.

### Done criteria
- Determinism and output-branch tests.

---

## Phase 4 — Arbiter + Freeze + Execution Adapter

### Objective
Validate and freeze plans before execution submission.

### Deliverables
- Security/structure arbiter.
- Plan freeze (version/hash).
- State tracking through provider (`submit/get/subscribe/cancel`).

### Done criteria
- State transition and rollback/cancel tests.

---

## Phase 5 — Audit E2E & Traceability

### Objective
Make each decision and relation observable and traceable.

### Deliverables
- MVP audit-event taxonomy.
- Correlation ID propagation across the full path.
- Baseline audit-integrity verification.

### Done criteria
- Full timeline reconstruction for one intent.

---

## Phase 6 — Portability & Contract Tests

### Objective
Prove core runtime independence.

### Deliverables
- Contract tests for PLOS adapters.
- Contract tests for execution providers.
- Second adapter/provider implementation (mock/stub).

### Done criteria
- Adapter/provider swap without core rewrite.

---

## Conformance Governance

Each phase must ship conformance tests in `test/conformance/phaseN` before the phase is considered complete.

---

## Recommended Cadence
- Sprint A: Phases 0-1
- Sprint B: Phases 2-3
- Sprint C: Phases 4-5
- Sprint D: Phase 6
