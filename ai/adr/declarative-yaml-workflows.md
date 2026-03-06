# ADR: Declarative YAML Workflow Definitions

## Status

accepted

## Context

Agent Harness needs a way for users to define multi-step agent workflows (DAGs of prompt executions). The definition format must be easy to read, write, and version control. It should not require programming knowledge to create simple workflows.

## Decision

Workflow graphs are defined declaratively in YAML (or JSON) configuration files. Each file describes nodes (prompt executions), edges (dependencies and data flow), and optional branching conditions.

## Consequences

- Positive: easy to read and write for non-programmers
- Positive: version-controllable and diffable
- Positive: static analysis and validation possible at parse time
- Positive: aligns with convention-over-configuration ethos
- Negative: limited expressiveness for complex branching logic
- Negative: may need escape hatches for advanced use cases in the future

## Alternatives considered

- **Programmatic TypeScript definitions** — more powerful but raises the barrier to entry and makes workflows harder to share
- **Visual workflow builder** — out of scope (no UI is a non-goal)
- **Hybrid (YAML + code)** — adds complexity; start with pure declarative and extend later if needed
