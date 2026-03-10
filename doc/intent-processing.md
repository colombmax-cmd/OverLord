## Intent Processing and Agent Coordination

The system separates governance, reasoning, and execution responsibilities.

User intent is processed through a layered architecture involving
Overlord, cognitive agents, and action agents.

### Roles

**Overlord Runtime**

Overlord acts as the governance and coordination layer.

Responsibilities include:

- receiving user intent
- selecting the most relevant cognitive agent
- granting bounded access to PLOS memory
- validating proposed workflows
- requesting clarifications from the user when necessary
- approving execution permissions
- submitting workflows to the execution engine
- recording audit events

Overlord does not perform domain reasoning or direct task execution.


**Cognitive Agents**

Cognitive agents provide domain-specific reasoning.

Their responsibilities include:

- interpreting user intent within their specialization domain
- reading authorized portions of PLOS
- detecting missing information
- proposing a workflow to achieve the user's goal
- requesting clarification if the intent is incomplete
- suggesting the involvement of other cognitive agents
- identifying additional memory scope requirements

Cognitive agents never execute actions directly.

They only produce structured proposals.


**Action Agents**

Action agents execute concrete tasks.

Examples include:

- interacting with external APIs
- publishing content
- sending communications
- writing structured data into PLOS

Action agents do not perform high-level reasoning.
They execute validated workflow steps.


### Workflow Construction Model

Workflow construction is collaborative.

1. The user expresses an intent to Overlord.
2. Overlord selects a relevant cognitive agent.
3. Overlord grants limited memory access.
4. The cognitive agent analyzes the request and context.
5. The cognitive agent returns one of the following:

   - a workflow proposal
   - a clarification request
   - a request for additional memory scope
   - a recommendation to involve another cognitive agent
   - a recommendation for no action

6. Overlord evaluates the response and arbitrates the next step.
7. If a workflow is approved, Overlord submits it to the execution engine.
8. The execution engine coordinates action agents to perform the tasks.


### Governance Principle

Cognitive agents may propose actions.

Overlord remains the authority that authorizes them.

This separation ensures:

- memory sovereignty
- controlled automation
- clear auditability
- modular intelligence
