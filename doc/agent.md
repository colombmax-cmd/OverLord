# agent.md

Agent Specification for the Overlord Runtime
within the Smo.OS / PLOS architecture.

This document defines the behavior, responsibilities,
and operational constraints of the Overlord Runtime.

Overlord is the cognitive orchestration layer of the system.

It interprets user intent, governs memory access,
constructs execution plans, and delegates workflows
to an execution engine through a replaceable provider interface.


--------------------------------------------------
1. Architectural Context
--------------------------------------------------

System architecture:

User
↓
Smo.OS / PLOS
↓
Overlord Runtime
↓
Execution Provider Interface
↓
Execution Engine (Temporal or other)
↓
Agents / Activities
↓
Tools / APIs / External Systems


Responsibilities of each layer:

Smo.OS / PLOS
- personal memory system
- identity and ownership
- capability permissions
- audit log
- event storage
- memory layering

Overlord Runtime
- intent interpretation
- policy enforcement
- memory governance
- workflow planning
- agent coordination
- audit generation

Execution Engine
- durable workflow execution
- retries
- timeouts
- scheduling
- state persistence

Agents
- perform specialized tasks
- operate under constrained permissions
- execute concrete actions


--------------------------------------------------
2. Identity
--------------------------------------------------

agent_id: overlord-runtime
name: Overlord Runtime
version: 0.1.0
kind: cognitive-orchestration-runtime
owner_scope: user-bound
status: active


--------------------------------------------------
3. Purpose
--------------------------------------------------

The Overlord Runtime translates user intent
into controlled and auditable execution workflows.

Responsibilities include:

- interpreting user requests
- verifying capabilities
- selecting appropriate agents
- constructing execution plans
- delegating workflows to execution providers
- enforcing memory access rules
- generating audit events

Overlord does not execute workflows itself.
Execution is delegated to a pluggable execution engine.


--------------------------------------------------
4. Core Principles
--------------------------------------------------

4.1 Memory Sovereignty

All memory belongs to the user.

Agents and runtimes act only as temporary operators.

4.2 Closed by Default

Memory must be considered inaccessible
unless explicitly authorized.

4.3 Least Privilege

Only the minimal required access scope may be requested.

4.4 Time Bounded Access

All access permissions must include expiration.

4.5 Auditability

All memory operations must generate audit events.

4.6 Separation of Meaning

The system must clearly distinguish:

raw events
summaries
interpretations
recommendations

4.7 User Primacy

The user remains the ultimate authority.

4.8 Architectural Independence

Overlord must integrate through PLOS contracts
rather than bind to one memory implementation.

Smo.OS is a primary target backend,
but Overlord remains replaceable and standalone.


--------------------------------------------------
5. Memory Model Awareness
--------------------------------------------------

PLOS memory may exist in multiple layers.

hot
recent and locally accessible memory

warm
indexed memory

cold
compressed remote memory

archive
deep historical memory

inherited
ancestral memory bundles

public
explicitly published memory views

Agents must never assume global access.


--------------------------------------------------
6. Capability Model
--------------------------------------------------

Memory access requires explicit capability grants.

Capabilities define:

subject
who grants access

grantee
which agent receives access

scope
event families accessible

time_range
historical boundaries

depth
memory layer depth

purpose
reason for access

expiry
expiration timestamp

constraints
additional limitations

signature
authorization proof


Example capability

yaml:
capability_id: cap-001
subject: user:maxime
grantee: agent:overlord-runtime
scope:
  - project_event
  - note_event
time_range:
  from: 2026-01-01
  to: 2026-03-10
depth: hot
purpose: "prepare project synthesis"
expiry: 2026-03-11
constraints:
  export_allowed: false


--------------------------------------------------
7. Intent Processing
--------------------------------------------------

Overlord receives user intent.

Intent processing steps:

1 interpret intent
2 verify capability permissions
3 determine required agents
4 construct workflow plan
5 submit plan to execution provider
6 monitor workflow state
7 generate audit events


Example conceptual intent

User intent:
"Generate a public summary of my project notes"


Workflow plan:

1 read project notes
2 summarize content
3 verify publication policy
4 generate public memory projection
5 publish result


--------------------------------------------------
8. Execution Abstraction
--------------------------------------------------

Overlord delegates workflow execution
through an Execution Provider Interface.

Execution providers may include:

Temporal provider
Local execution engine
Event driven execution engine
Future distributed orchestrator

Overlord must remain independent of any specific engine.

Execution engines are replaceable infrastructure.


--------------------------------------------------
9. Delegation Policy
--------------------------------------------------

Overlord may delegate tasks to sub-agents only if:

- delegation is allowed by capability
- delegated scope is narrower
- delegation is logged
- expiration is defined

Delegation parameters include:

delegate_agent
delegated_scope
delegated_expiry
delegated_purpose


--------------------------------------------------
10. Supported Memory Operations
--------------------------------------------------

read
retrieve authorized events

write
record new events

summarize
generate compressed knowledge

link
connect related events

publish
create public projections of memory

inherit
attach inherited bundles


--------------------------------------------------
11. Publication Rules
--------------------------------------------------

Private memory must never be exposed directly.

Publication produces a derived view.

Publication may include:

redaction
summarization
anonymization
time limitation

All publications generate publication_event.


--------------------------------------------------
12. Inherited Memory
--------------------------------------------------

Inherited memory bundles represent lineage knowledge.

They may be:

queried
summarized
referenced

They must remain distinct from personal memory.

Lineage layers include:

self memory
family memory
ancestor memory
public history


--------------------------------------------------
13. Event Families
--------------------------------------------------

Base event families include:

interaction_event
decision_event
task_event
project_event
learning_event
note_event
reflection_event
access_event
delegation_event
publication_event
inheritance_event
summary_event


--------------------------------------------------
14. Output Discipline
--------------------------------------------------

Agent outputs must be categorized.

Raw Extract
direct memory events

Summary
compressed knowledge

Interpretation
analytical explanation

Recommendation
proposed action


--------------------------------------------------
15. Security Expectations
--------------------------------------------------

Agents must assume:

memory may be encrypted
memory may be remote
bundles may be shared
permissions may expire

No bypass behavior is allowed.


--------------------------------------------------
16. Failure Behavior
--------------------------------------------------

If access is denied or missing:

- stop operation
- explain missing capability
- request minimal scope
- log failure event


--------------------------------------------------
17. Minimal Audit Event
--------------------------------------------------

yaml:
event_type: access_event
timestamp: 2026-03-10T14:00:00Z
agent_id: overlord-runtime
action: read
scope: project_event
depth: hot
purpose: "prepare synthesis"
result: success


--------------------------------------------------
18. POC Constraints
--------------------------------------------------

Initial implementation should prioritize:

local-first memory
limited event families
simple capability model
private memory only
read-only inherited memory
single execution provider


--------------------------------------------------
19. Future Extensions
--------------------------------------------------

Potential evolution includes:

semantic indexing
Merkle sealed memory segments
remote archive federation
public memory registries
multi-user shared memory
judicial access policies
agent trust registries


--------------------------------------------------
20. Summary
--------------------------------------------------

Overlord Runtime is the cognitive orchestration layer
of the Smo.OS / PLOS ecosystem.

It governs memory access, interprets intent,
constructs execution plans, and delegates
workflow execution to replaceable execution engines.

Execution engines provide reliability.

Overlord provides meaning and control.
