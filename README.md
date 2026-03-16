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
PLOS-compatible memory layer (e.g. Smo.OS)
↓
Overlord Runtime
↓
Execution Provider (Temporal or other)
↓
Agents
↓
Tools / APIs

## Responsibilities

Overlord:
- interprets user intent
- enforces memory permissions
- builds workflow plans
- delegates execution
- generates audit events

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

Roadmap de delivery MVP Core: [`doc/mvp-core-roadmap.md`](./doc/mvp-core-roadmap.md).



## Getting started (MVP scaffold)

```bash
npm install
npm test
npm run dev
```
