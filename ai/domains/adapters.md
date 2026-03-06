# Adapters

## Purpose

Abstraction layer over agent backends. Provides a uniform interface for the execution engine to run any supported coding agent.

## Responsibilities

- Define the adapter interface (start, stop, send input, capture output, capture questions)
- Implement Claude Code adapter with OAuth login support
- Handle agent process lifecycle within the Docker container
- Translate between agent-specific question/answer formats and the harness's internal format

## Invariants

- All agent interaction goes through the adapter interface — no direct agent calls from other components
- Adapters must support the question-surfacing protocol
- Claude Code adapter must support OAuth login (user's subscription plan), not just API keys

## Interfaces

- Inputs: rendered prompt, execution context (working directory, environment)
- Outputs: agent output stream, questions, completion status
- Public APIs/events: AgentAdapter interface { start(), sendInput(), getOutput(), getQuestions(), stop() }

## Key flows

1. Execution engine creates adapter instance -> passes prompt and context -> adapter starts agent process
2. Agent produces output -> adapter streams it to execution engine
3. Agent asks a question -> adapter captures and formats it -> surfaces to execution engine
4. Execution engine sends answer -> adapter relays to agent process

## Dependencies

- Upstream: execution (only consumer of adapters)
- Downstream: Claude Code CLI, future agent CLIs

## Constraints

- Must authenticate via Claude Code OAuth — API key support is secondary
- Adapter interface must be generic enough for non-Claude agents

## High level code locations

- Adapter interface (`AgentAdapter`, `AgentRunOptions`): `src/adapters/adapter.ts`
- Claude Code adapter implementation: `src/adapters/claude-code.ts`
