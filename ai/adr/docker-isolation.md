# ADR: Docker for Agent Isolation

## Status

accepted

## Context

Agent Harness needs to run coding agents in isolation to prevent them from accessing resources they shouldn't, to enable parallel task execution against the same codebase, and to allow tool use without interactive permission prompts. The isolation mechanism must be reliable, well-understood, and widely available on developer machines.

## Decision

Use Docker containers as the primary isolation boundary for agent execution. Each agent task runs inside its own container with only the necessary repo files and tools mounted.

## Consequences

- Positive: strong, well-understood isolation model
- Positive: fine-grained control over file system access, network, and tool availability
- Positive: widely available on macOS, Linux, and Windows
- Positive: reproducible execution environments
- Negative: Docker must be installed on the host machine
- Negative: container startup adds latency to each task
- Negative: resource overhead per container (memory, disk)

## Alternatives considered

- **nsjail / firejail** — lighter weight but less portable and less familiar to most developers
- **Raw process sandboxing** — insufficient isolation guarantees across platforms
- **No isolation (trust the agent)** — unacceptable risk for parallel execution and unsupervised tool use
