# Intent Model

An Intent represents a user goal expressed in natural or structured form.

Example:

Intent:
type: summarize_project
scope: project_notes
target: public_summary

Processing pipeline:

Intent
↓
Overlord interpretation
↓
WorkflowPlan generation
↓
Execution delegation
