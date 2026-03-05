# Roadmap: Agent Harness

## Overview

Agent Harness is built in three coarse phases that mirror the natural dependency chain: first establish the infrastructure foundation (containers, git worktrees, prompt templates, IPC protocol), then prove single-task execution end-to-end including human-in-the-loop question surfacing, then unlock the full value proposition with concurrent fan-out, conditional routing, and workflow resilience. Each phase delivers something independently verifiable before the next begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Container infrastructure, git worktree isolation, prompt template engine, and IPC protocol — everything downstream phases depend on
- [x] **Phase 2: Single-Task Execution** - End-to-end: run one workflow node with a prompt against a repo, capture structured output, surface agent questions to the CLI operator, and resume on answer (completed 2026-03-05)
- [x] **Phase 3: Concurrent Workflow Engine** - Fan-out parallel execution across isolated containers, conditional routing, and workflow resume after crash (completed 2026-03-05)

## Phase Details

### Phase 1: Foundation
**Goal**: The core infrastructure exists, is safe under all failure modes, and is ready for task execution to be built on top
**Depends on**: Nothing (first phase)
**Requirements**: TMPL-01, TMPL-02, TMPL-03, CONT-01, CONT-02, GIT-01, GIT-02
**Success Criteria** (what must be TRUE):
  1. A Docker container can be created, started, and stopped by the harness; containers are cleaned up on both normal exit and SIGKILL crash (no zombie containers)
  2. Container network and filesystem access is restricted — agent process cannot make unrestricted outbound network calls or access arbitrary host filesystem paths
  3. Each task gets its own git worktree scoped to a unique branch; two concurrent task worktrees do not share filesystem state
  4. A prompt template file with `{{variable}}` syntax renders correctly with provided values; user can dry-run render to inspect the final prompt before any execution
  5. Multiple partial template files compose into a single rendered prompt
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — TypeScript ESM project scaffold with shared types and test infrastructure
- [ ] 01-02-PLAN.md — Prompt template engine (TMPL-01, TMPL-02, TMPL-03) using Handlebars
- [x] 01-03-PLAN.md — Git worktree isolation and branch tracker (GIT-01, GIT-02)
- [ ] 01-04-PLAN.md — Docker container lifecycle manager with isolation and SIGKILL-safe cleanup (CONT-01, CONT-02)

### Phase 2: Single-Task Execution
**Goal**: A single workflow node executes Claude Code via the Agent SDK on the host, the agent can ask a question mid-task that pauses execution and is answered by the CLI operator via file-based IPC, and the run produces structured output persisted to disk
**Depends on**: Phase 1
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, WKFL-01, WKFL-02
**Success Criteria** (what must be TRUE):
  1. User runs `agent-harness run <template> <repo>` and the agent executes in an isolated container, producing a result
  2. A YAML workflow file with a single node can be defined and executed end-to-end with `agent-harness run workflow.yaml`
  3. When the agent asks a question during a run, execution pauses and the question is displayed at the CLI — the run does not crash or time out
  4. The CLI operator provides an answer via `agent-harness answer <run-id> "<answer>"` and the agent resumes execution
  5. Agent output is written to a designated markdown file and the harness reads it as the structured task result; the run exits with a correct exit code
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Shared types, HITL QuestionStore (file-based IPC), and YAML workflow parser
- [ ] 02-02-PLAN.md — Task Executor (Claude Agent SDK wrapper) and sequential Workflow Runner
- [ ] 02-03-PLAN.md — CLI wiring (run + answer commands) and end-to-end verification

### Phase 3: Concurrent Workflow Engine
**Goal**: Multiple workflow nodes run in parallel across isolated containers with their own git worktrees, workflow edges can route conditionally based on node output, and an interrupted workflow can be resumed from its last completed node
**Depends on**: Phase 2
**Requirements**: WKFL-03, WKFL-04, WKFL-05
**Success Criteria** (what must be TRUE):
  1. A workflow with two independent nodes fans out and executes both nodes concurrently in separate containers with separate git worktrees
  2. A workflow edge with a condition routes to different downstream nodes based on a field in the upstream node's output
  3. A workflow interrupted mid-run (process killed) can be resumed with `agent-harness resume <run-id>` and continues from the last completed node without re-running already-completed nodes
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Foundation modules: types, DAG scheduler, condition evaluator, state persistence
- [x] 03-02-PLAN.md — DAG-based concurrent runner replacing sequential runner
- [x] 03-03-PLAN.md — CLI resume command and end-to-end verification

### Phase 4: Wire Git Worktree Isolation
**Goal**: Git worktree and branch tracking modules are wired into the execution pipeline so each task runs in its own worktree on a unique branch
**Depends on**: Phase 1, Phase 2
**Requirements**: GIT-01, GIT-02
**Gap Closure:** Closes gaps from audit
**Success Criteria** (what must be TRUE):
  1. `cli/run.ts` creates a worktree before passing the repo path to the executor, and cleans it up after
  2. `BranchTracker` is instantiated and updated during task execution
  3. Two concurrent tasks get separate worktrees and do not share filesystem state
**Plans**: 2 plans

Plans:
- [ ] 04-01-PLAN.md — Wire worktree lifecycle and BranchTracker into workflow runner with integration tests
- [ ] 04-02-PLAN.md — Wire BranchTracker and worktree creation into CLI entry points (run + resume)

### Phase 5: Wire Container Isolation
**Goal**: ContainerManager is integrated into the execution pipeline so every task executes inside a Docker container with iptables-based network isolation and restricted filesystem access
**Depends on**: Phase 4
**Requirements**: CONT-01, CONT-02
**Gap Closure:** Closes gaps from audit
**Success Criteria** (what must be TRUE):
  1. `TaskExecutor` creates a Docker container via `ContainerManager` and runs the Claude CLI agent inside it
  2. Containers use bridge networking with iptables firewall (default-deny, whitelisted: Anthropic API, npm, GitHub, DNS)
  3. Containers are cleaned up on both normal exit (AutoRemove) and crash (reclaimOrphans on next startup)
**Plans**: 2 plans

Plans:
- [ ] 05-01-PLAN.md — Docker image artifacts, firewall script, image builder, and ContainerManager rework
- [ ] 05-02-PLAN.md — TaskExecutor rewrite for container execution, runner and CLI wiring

### Phase 6: Wire State Persistence & CLI Dry-Run
**Goal**: Workflow state is persisted during runs (enabling resume) and dry-run template rendering is exposed via the CLI
**Depends on**: Phase 2, Phase 3
**Requirements**: WKFL-05, TMPL-03
**Gap Closure:** Closes gaps from audit
**Success Criteria** (what must be TRUE):
  1. `cli/run.ts` passes a `stateManager` to `runWorkflow()` so state is saved during execution
  2. `agent-harness resume <run-id>` successfully resumes a killed workflow from the last completed node
  3. `agent-harness dry-run <template> --vars '...'` renders and prints the final prompt without executing
**Plans**: 1 plans

Plans:
- [ ] 06-01-PLAN.md — Wire stateManager into run/resume CLI and add dry-run command

### Phase 7: Restore HITL for Container Model
**Goal**: QuestionStore-based human-in-the-loop is restored for the container execution model so agents can ask questions mid-task and CLI operators can answer them
**Depends on**: Phase 5
**Requirements**: EXEC-02, EXEC-03
**Gap Closure:** Closes gaps from audit (Phase 5 container rewrite regression)
**Success Criteria** (what must be TRUE):
  1. When an agent running inside a container asks a question, a `question.json` is produced and the question is surfaced at the CLI
  2. The CLI operator provides an answer via `agent-harness answer <run-id> "<answer>"` and the agent resumes execution inside the container
  3. The HITL loop works end-to-end through the container boundary using file-based IPC on mounted volumes
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md — Agent-runner script, Dockerfile updates, ContainerManager Cmd change, and host-side question polling
- [ ] 07-02-PLAN.md — Answer CLI adaptation for worktree-based IPC and end-to-end HITL wiring

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/4 | In Progress|  |
| 2. Single-Task Execution | 3/3 | Complete   | 2026-03-05 |
| 3. Concurrent Workflow Engine | 3/3 | Complete   | 2026-03-05 |
| 4. Wire Git Worktree Isolation | 0/2 | In Progress|  |
| 5. Wire Container Isolation | 0/2 | Pending    |  |
| 6. Wire State Persistence & CLI Dry-Run | 0/1 | Pending    |  |
| 7. Restore HITL for Container Model | 0/2 | Pending    |  |
