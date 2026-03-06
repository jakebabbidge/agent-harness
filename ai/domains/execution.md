# Execution

## Purpose

Manages isolated agent runs. Creates sandboxed environments, runs agents inside them, and handles the question queue for paused tasks.

## Responsibilities

- Create isolated repo copies (worktree or directory copy) for each task
- Manage Docker container lifecycle for agent execution
- Start agent processes via the appropriate adapter
- Queue agent questions and pause tasks waiting for answers
- Resume tasks when answers are provided
- Track task state (running, paused, completed, failed)
- Support multiple concurrent isolated tasks against the same repo

## Invariants

- Every agent run happens inside a Docker container — no direct host execution
- Each task gets its own isolated repo copy — tasks never share a working directory
- A paused task does not consume compute resources beyond its container being suspended

## Interfaces

- Inputs: rendered prompt, target repo, agent adapter selection
- Outputs: agent output, task status, queued questions
- Public APIs/events: run(prompt, repo, adapter), getQuestions(taskId), answerQuestion(taskId, questionId, answer)

## Key flows

1. CLI requests task execution -> execution engine clones/worktrees the repo -> builds Docker container -> starts agent via adapter
2. Agent asks a question -> adapter captures it -> execution engine queues it and pauses the task
3. User answers via CLI -> execution engine relays answer to adapter -> agent resumes
4. Agent completes -> execution engine captures output -> updates task status

## Dependencies

- Upstream: CLI, workflows (invoke execution)
- Downstream: adapters (to run agents), Docker (container runtime), Git (repo isolation)

## Constraints

- Must handle concurrent tasks without interference
- Docker must be available on the host machine

## High level code locations

- Docker primitives (build, run, interactive run): `src/execution/docker.ts`
- Container lifecycle orchestration (executeRun, executeLogin, ensureImage): `src/execution/container-lifecycle.ts`
- Docker image hash caching (rebuild detection): `src/execution/image-hash.ts`
