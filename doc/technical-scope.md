# Overlord Technical Scope ("How")

This document defines *how* Overlord should be built as a PLOS-aligned cognitive orchestrator.
It complements the philosophy/positioning documents by translating principles into technical boundaries.

## 1) System Boundary

Overlord is a standalone service between:

- **northbound**: user-facing intent entrypoints (API, CLI, or UI backend)
- **southbound**: PLOS-compatible memory/capability backend (e.g. Smo.OS)
- **execution side**: workflow execution provider (Temporal or equivalent)
- **agent side**: cognitive and action agents

Overlord does not own memory persistence and does not implement workflow durability itself.

## 2) Core Runtime Components

### 2.1 Intent Gateway

Responsibilities:
- receive user intent payloads
- validate intent schema/version
- assign correlation identifiers
- normalize intent into canonical internal format

### 2.2 Policy & Capability Guard

Responsibilities:
- verify required capabilities before any memory access
- enforce least privilege and expiration constraints
- deny by default when capabilities are missing
- emit audit events for authorization decisions

### 2.3 Planning Engine

Responsibilities:
- map intent → candidate workflow plan
- request clarification when intent is under-specified
- request additional scope if minimally required
- produce structured plan output consumable by execution provider

### 2.4 Agent Coordinator

Responsibilities:
- select cognitive agent profile(s)
- coordinate proposal/feedback loop
- enforce proposal-only behavior for cognitive agents
- translate approved steps into executable action tasks

### 2.5 Execution Adapter

Responsibilities:
- convert internal plan into provider-specific workflow definitions
- submit, monitor, and reconcile workflow status
- abstract provider details behind stable interface

### 2.6 Audit Emitter

Responsibilities:
- generate immutable audit records for:
  - intent reception
  - capability checks
  - delegation and execution transitions
  - publication-sensitive operations

## 3) Minimal Interface Contracts

## 3.1 PLOS Adapter Interface

Required operations:
- `check_capability(request) -> decision`
- `read_events(query, capability) -> events`
- `write_event(event, capability) -> ack`
- `publish_projection(payload, policy, capability) -> projection_ref`
- `emit_audit(audit_event) -> ack`

Constraint:
- Adapter must be implementation-agnostic (Smo.OS first target, not exclusive target).

## 3.2 Execution Provider Interface

Required operations:
- `submit_workflow(plan) -> workflow_id`
- `get_workflow_state(workflow_id) -> state`
- `cancel_workflow(workflow_id, reason) -> ack`
- `subscribe_events(workflow_id) -> event_stream`

Constraint:
- Overlord runtime behavior must remain unchanged when provider is swapped.

## 3.3 Agent Contract

Cognitive agent input/output:
- input: intent context + authorized memory window
- output: `{proposal | clarification | scope_request | no_action}`

Action agent input/output:
- input: validated executable step + scoped capability
- output: execution result + traces

## 4) End-to-End Control Flow (MVP)

1. Receive intent.
2. Validate/normalize intent.
3. Run initial capability pre-check.
4. Invoke cognitive agent for plan proposal.
5. Arbiter validates proposal and security constraints.
6. Request clarification/scope extension if needed.
7. Freeze approved plan.
8. Submit plan via execution adapter.
9. Track state and emit audit events.
10. Return final outcome + traceable references.

## 5) Data Model (MVP)

Core entities:
- `IntentEnvelope`
- `CapabilityDecision`
- `WorkflowPlan`
- `WorkflowStep`
- `DelegationGrant`
- `ExecutionRun`
- `AuditEvent`

All entities require:
- deterministic IDs
- timestamps
- actor identity
- correlation ID
- schema version

## 6) Non-Functional Requirements

- **Security**: closed-by-default access model
- **Traceability**: every decision path auditable
- **Determinism**: planning outputs reproducible for same inputs/version
- **Resilience**: execution retries delegated to provider
- **Portability**: no hardcoded dependency on one memory backend or one workflow engine

## 7) Explicit Out of Scope (initial phase)

- multi-tenant shared governance
- advanced semantic planning/autonomous self-improvement
- distributed consensus between orchestrators
- custom workflow engine implementation
- full UI productization

## 8) Implementation Sequence (recommended)

### 8.1 Core delivery path

1. Define canonical schemas (`IntentEnvelope`, `WorkflowPlan`, `AuditEvent`).
2. Implement PLOS adapter interface with Smo.OS compatibility target.
3. Implement execution adapter with one provider (Temporal or local mock).
4. Implement policy/capability guard.
5. Implement cognitive proposal loop + arbiter.
6. Add end-to-end trace/audit validation tests.
7. Add second provider/backend adapter to validate portability claims.

### 8.2 Non-Core tracks to run in parallel

These tracks are not optional long-term; they are staged alongside Core depending on maturity targets.

#### Security hardening

- threat model for intent injection, privilege escalation, and data exfiltration
- capability misuse detection and denial telemetry
- secrets management and key rotation policy
- transport security between Overlord, PLOS backend, and execution provider
- policy for signed adapter/provider requests

#### Reliability and Operations

- SLOs (availability, latency, workflow completion success)
- structured retries/backoff strategy at adapter boundaries
- dead-letter handling for failed workflow events
- runbooks and incident response procedures
- backup/restore strategy for audit and state references

#### Observability and Audit Quality

- end-to-end tracing with correlation ID propagation
- metrics for capability denials, clarifications, and plan acceptance rate
- immutable audit integrity checks
- dashboards for workflow state and bottlenecks

#### Compliance and Governance

- retention and redaction policies for audit events
- publication policy enforcement tests
- access review workflow for delegated scopes
- evidence packaging for external audits

#### Developer Experience and Quality

- contract tests for adapters (PLOS and execution provider)
- deterministic replay tests for planning outputs
- fixture-based simulation of cognitive/action agent responses
- versioning and migration policy for schemas

### 8.3 Suggested release layering

- **v1**: Core path + baseline security + baseline observability
- **v1.1**: reliability/ops hardening + adapter contract test suite
- **v1.2**: governance/compliance automation + replay determinism guarantees

## 9) Done Criteria for Technical Scope v1

- Overlord can process one intent family end-to-end.
- Capability checks are enforced before each protected operation.
- Workflow submission/monitoring works through adapter abstraction.
- All major transitions produce auditable events.
- Replacing either memory adapter or execution provider requires no core rewrite.
