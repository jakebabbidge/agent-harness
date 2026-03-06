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

## Key flows

1. User runs a command -> CLI parses args -> routes to appropriate subsystem
2. User checks for questions -> CLI queries execution engine -> displays pending questions
3. User answers a question -> CLI relays answer to execution engine -> paused task resumes

## Dependencies

- Upstream: none (entry point)
- Downstream: prompts, execution, workflows

## Constraints

- Must remain responsive even with many parallel tasks running

## High level code locations

- CLI program definition: `src/cli/index.ts`
- CLI entry point: `src/main.ts`
