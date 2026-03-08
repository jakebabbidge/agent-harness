# Architecture

## System overview

Agent Harness is a CLI application composed of five major subsystems: a CLI layer, a prompt engine, an execution engine, a workflow engine, and agent adapters. The CLI routes user commands to the appropriate subsystem. Prompts are composed from templates and fed to agents running in isolated Docker containers. Workflows orchestrate multi-step agent executions as directed acyclic graphs.

## Major components

- **CLI layer** — command parsing, routing, and user interaction (including answering queued agent questions)
- **Prompt engine** — loads, composes, and renders prompt templates with variable substitution from the global template library
- **Execution engine** — manages isolated agent runs via Docker containers and repo isolation (worktrees or copied directories), surfaces agent questions to the host via file-based IPC
- **Workflow engine** — parses declarative YAML/JSON workflow definitions, orchestrates DAG execution, routes inputs/outputs between nodes
- **Agent adapters** — abstraction layer over agent backends; Claude Code adapter (with OAuth support) is the first implementation

## Boundaries

- The CLI layer is the only user-facing surface — all interaction flows through it
- The execution engine owns isolation — no other component manages containers or repo copies
- The prompt engine is stateless — it renders templates but does not execute them
- Agent adapters are the only components that communicate with external agent tools
- The workflow engine orchestrates execution engine calls but does not run agents directly

## Key data flows

1. User issues CLI command -> CLI parses and routes to appropriate subsystem
2. Prompt engine loads template from `~/.agent-harness/`, substitutes variables, produces rendered prompt
3. Execution engine creates isolated environment (Docker container with shared temp dir), passes prompt to agent adapter
4. In-container Agent SDK runtime's programmatic hook intercepts `AskUserQuestion` -> writes question JSON to shared dir -> host polls and prompts user -> writes answer JSON -> hook reads answer and denies tool call with answer
5. Container exits -> execution engine reads output and cleans up
6. Workflow engine reads YAML definition, determines next node, invokes execution engine for each step, routes outputs to subsequent nodes

## External integrations

- Docker: container lifecycle management for isolated agent execution
- `@anthropic-ai/claude-agent-sdk`: first agent backend (via OAuth token)
- Git: repo isolation via worktrees or directory copies

## Domain links

- [CLI](./domains/cli.md)
- [Prompts](./domains/prompts.md)
- [Execution](./domains/execution.md)
- [Workflows](./domains/workflows.md)
- [Adapters](./domains/adapters.md)
