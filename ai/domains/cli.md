# CLI

## Purpose

The user-facing command layer. Parses commands, routes to subsystems, and provides the interface for answering agent questions across parallel tasks.

## Responsibilities

- Parse CLI commands and arguments via Commander.js
- Route commands to prompt, execution, and workflow subsystems
- Display task status and agent output
- List and present queued questions from running/paused tasks
- Accept user answers and relay them to the execution engine

## Invariants

- All user interaction flows through the CLI — no other component prompts the user directly
- Questions are always associated with a specific task

## Interfaces

- Inputs: user commands, user answers to agent questions
- Outputs: task status, agent output, queued questions
- Public APIs/events: command handlers registered with Commander.js

## Current commands

- `run <template> [--var key=value...]` — loads and renders a prompt template file, then runs Claude Code with it in an isolated Docker container
- `dry-run <template> [--var key=value...]` — loads and renders a prompt template file, prints the result to stdout without executing
- `login` — starts an interactive container for Claude Code OAuth login

## Key flows

1. User runs a command -> CLI parses args -> routes to appropriate subsystem
2. During `run`, agent questions are surfaced in real time via the `promptUserForAnswer` callback -> user answers interactively in the terminal -> answer is relayed back to the container via IPC

## Dependencies

- Upstream: none (entry point)
- Downstream: prompts, execution, workflows

## Constraints

- Must remain responsive even with many parallel tasks running

## High level code locations

- CLI program definition: `src/cli/index.ts`
- CLI entry point: `src/main.ts`
- Interactive question prompting (single/multi select, free text): `src/cli/prompt.ts`
