# Architecture

The ecosystem is intentionally split into replaceable layers.

User
↓
Overlord (Cognitive Orchestrator)
↓
Memory access request
↓
MAL in Smo.OS / PLOS backend
↓
Filtered memory view
↓
Cognitive Agent
↓
Workflow proposal
↓
Overlord validation
↓
Execution Engine (Temporal or other)
↓
Action Agents
↓
External tools

## Separation contract

### Memory Layer (PLOS + MAL)

Provides:
- personal memory storage
- identity and ownership
- capability issuance and validation
- authoritative memory access enforcement (MAL)
- filtered memory views
- audit/event persistence

Does not provide:
- orchestration policy
- workflow planning
- agent reasoning arbitration

### Orchestration Layer (Overlord)

Provides:
- intent interpretation
- memory-access request planning (scope intent)
- workflow planning and validation
- agent coordination
- delegation to execution providers

Does not provide:
- authoritative memory permission enforcement
- durable workflow runtime internals
- personal memory ownership/storage

## Interoperability principles

- PLOS defines the contract boundary.
- MAL is a backend-side concern (inside Smo.OS/PLOS implementations).
- Overlord targets contracts and receives filtered views; it does not own memory enforcement.
- Smo.OS is a first-class target backend, but not a hard dependency.
- Multiple orchestrators should be able to operate on compatible PLOS backends.

## Key design principles

- memory sovereignty
- replaceable execution engines
- agent specialization
- capability-based security
- modular orchestration
