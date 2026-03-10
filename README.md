# Overlord

Overlord is the cognitive orchestration runtime for the Smo.OS / PLOS ecosystem.

It interprets user intent, enforces memory capabilities, constructs workflow plans,
and delegates execution to replaceable workflow engines.

## Architecture

Smo.OS / PLOS
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

## Related projects

Smo.OS – personal memory layer  
Agents – specialized workers (to come)
