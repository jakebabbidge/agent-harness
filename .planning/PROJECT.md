# Agent Harness

## What This Is

Agent Harness is a CLI tool that wraps coding agents (starting with Claude Code) in a standardized execution environment. It provides composable prompt templating, containerized isolated execution with concurrent in-flight tasks, and graph-based workflow orchestration — enabling reproducible, parallel, and observable agent-driven development workflows.

## Core Value

Multiple concurrent coding agent tasks run in full isolation against a codebase, coordinated by a declarative workflow graph, with human oversight surfaced at the CLI when agents need input.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Composable prompt template library with variable substitution and section composition
- [ ] Containerized isolated runtime per task (sandboxed tool access)
- [ ] Concurrent in-flight tasks against a codebase using git as tracking mechanism
- [ ] Agent questions surfaced to CLI operator; task pauses until answered
- [ ] Graph-based workflow execution defined in YAML/JSON config
- [ ] Workflow nodes declare inputs/outputs; conditional routing based on node output
- [ ] CLI entry point: `agent-harness run` and related commands

### Out of Scope

- Multi-agent support beyond Claude Code — focus on one agent well before generalizing
- Web UI or dashboard — CLI-first
- Cloud/hosted execution — local containers only for v1

## Context

- Existing code is present in the repo (brownfield) but no codebase map yet
- Claude Code is the first wrapped agent; architecture should make adding agents tractable later
- Isolation via containers (Docker or similar) — not just git worktrees — for real tool permission control
- Workflows are defined declaratively (YAML/JSON), not programmatically
- Human-in-the-loop: agents can surface questions mid-task, task blocks until answered at CLI

## Constraints

- **Tech stack**: To be determined during research — Node.js/TypeScript likely given CLI tooling ecosystem
- **Agent**: Claude Code only for v1
- **Isolation**: Container-based (Docker or similar) for sandboxed tool access
- **Interface**: CLI commands only — no TUI or web UI for v1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Container isolation over worktrees | Full tool permission control, not just filesystem isolation | — Pending |
| YAML/JSON workflow config | Declarative, portable, no code required to define workflows | — Pending |
| CLI-first UX | Direct, scriptable, composable with other tools | — Pending |

---
*Last updated: 2026-03-04 after initialization*
