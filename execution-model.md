# Execution Model

Overlord does not execute workflows directly.

Instead, it delegates execution to an execution provider.

Example providers:

Temporal
Local runtime
Event-driven runtime

Workflow lifecycle:

Intent
↓
WorkflowPlan
↓
ExecutionProvider
↓
ExecutionEngine
↓
Agents
