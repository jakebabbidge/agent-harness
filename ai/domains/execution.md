# Execution

## Purpose

Manages isolated agent runs. Creates sandboxed environments, runs agents inside them, and handles the question queue for paused tasks.

## Responsibilities

- Create isolated repo copies (worktree or directory copy) for each task
- Manage Docker container lifecycle for agent execution
- Start agent processes via the appropriate adapter
- Surface agent questions to the host via file-based IPC and relay user answers back
- Track task state (running, paused, completed, failed)
- Support multiple concurrent isolated tasks against the same repo

## Invariants

- Every agent run happens inside a Docker container — no direct host execution
- Each task gets its own isolated repo copy — tasks never share a working directory
- A paused task does not consume compute resources beyond its container being suspended

## Interfaces

- Inputs: rendered prompt, optional `QuestionHandler` callback
- Outputs: agent output, task status
- Public APIs/events: `executeRun(prompt, onQuestion?)`, `executeLogin()`

## Key flows

1. CLI requests task execution -> execution engine builds Docker image -> spawns container with shared temp dir
2. Agent SDK runtime calls `AskUserQuestion` -> `canUseTool` callback writes question JSON to shared dir -> host polls via `ipc.pollForQuestions()` -> invokes `QuestionHandler` callback -> writes answer JSON -> `canUseTool` reads answer and returns allow with `updatedInput` containing answers
3. Container exits -> execution engine reads output file -> cleans up IPC files and temp dir

## Dependencies

- Upstream: CLI, workflows (invoke execution)
- Downstream: adapters (to run agents), Docker (container runtime), Git (repo isolation)

## Constraints

- Must handle concurrent tasks without interference
- Docker must be available on the host machine

## High level code locations

- Docker primitives (build, run, spawn, interactive run): `src/execution/docker.ts`
- Container lifecycle orchestration (executeRun, executeLogin, ensureImage): `src/execution/container-lifecycle.ts`
- Docker image hash caching (rebuild detection): `src/execution/image-hash.ts`
- File-based IPC (question polling, answer writing): `src/execution/ipc.ts`
- In-container Agent SDK runtime (calls query(), canUseTool for AskUserQuestion): `src/runtime/agent-runner.ts`
- OAuth token extraction and persistence: `src/execution/token.ts`
