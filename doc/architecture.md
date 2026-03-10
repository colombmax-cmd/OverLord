# Architecture

The ecosystem is intentionally split into replaceable layers.

User
↓
PLOS-compatible memory system (Smo.OS or equivalent)
↓
Cognitive Orchestrator (Overlord or another runtime)
↓
Execution Engine (Temporal or other)
↓
Agents
↓
External tools

## Separation contract

### Memory Layer (PLOS)

Provides:
- personal memory storage
- identity and ownership
- capability issuance and validation
- audit/event persistence

Does not provide:
- orchestration policy
- workflow planning
- agent reasoning arbitration

### Orchestration Layer (Overlord)

Provides:
- intent interpretation
- policy enforcement
- workflow planning
- agent coordination
- delegation to execution providers

Does not provide:
- durable workflow runtime internals
- personal memory ownership/storage

## Interoperability principles

- PLOS defines the contract boundary.
- Overlord must target the contract, not a single vendor implementation.
- Smo.OS is a first-class target backend, but not a hard dependency.
- Multiple orchestrators should be able to operate on compatible PLOS backends.

## Key design principles

- memory sovereignty
- replaceable execution engines
- agent specialization
- capability-based security
- modular orchestration
