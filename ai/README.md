# AI Context

## What this repo is

Agent Harness is a CLI tool that wraps coding agents (starting with Claude Code) to provide standardised prompt management, isolated execution via Docker containers, and multi-step workflow orchestration via declarative YAML graphs. It is designed for individual developers who want reliable, repeatable, and safe agent-driven coding workflows.

## Start here

- [PROJECT.md](./PROJECT.md) — product intent, users, ethos, and non-goals
- [TECH_STACK.md](./TECH_STACK.md) — TypeScript/Node.js/pnpm stack, testing and coding standards
- [ARCHITECTURE.md](./ARCHITECTURE.md) — system components, boundaries, and data flows
- [DOMAIN_MAP.md](./DOMAIN_MAP.md) — navigable index of all domains

## Domains

- [CLI](./domains/cli.md) — command parsing, routing, question answering
- [Prompts](./domains/prompts.md) — template loading, composition, variable substitution
- [Execution](./domains/execution.md) — Docker isolation, repo copies, task/question management
- [Workflows](./domains/workflows.md) — DAG parsing, node orchestration, I/O routing
- [Adapters](./domains/adapters.md) — agent backend abstraction, Claude Code OAuth

## Architectural decisions

- [Docker for agent isolation](./adr/docker-isolation.md)
- [Claude Code OAuth as primary auth](./adr/claude-code-oauth.md)
- [Declarative YAML workflow definitions](./adr/declarative-yaml-workflows.md)
