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
- builds workflow plans
- delegates execution
- generates audit events

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
