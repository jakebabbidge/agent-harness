# Architecture Research

**Domain:** Coding Agent Orchestration / Harness CLI
**Researched:** 2026-03-04
**Confidence:** MEDIUM — Based on training knowledge of similar systems (Dagger, Temporal, LangGraph, AgentOps, Inngest). No primary sources accessible during this session; patterns are well-established but specific implementation details should be verified during build.

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLI Layer                                    │
│   agent-harness run <workflow>   agent-harness status   answer …    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                      Workflow Engine (DAG)                           │
│   Parse YAML/JSON config → Build graph → Topological walk           │
│   Route edges (conditional), fan-out concurrency, collect results   │
└────────┬──────────────────────────────────────────────┬─────────────┘
         │                                              │
┌────────▼────────────┐                    ┌───────────▼──────────────┐
│  Prompt Template    │                    │    State Store            │
│  Engine             │                    │    (SQLite / JSON files)  │
│  Variable subst.    │                    │    Run state, node        │
│  Section compose    │                    │    outputs, IPC queue     │
└────────┬────────────┘                    └──────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────────────────┐
│                       Task Executor                                  │
│   Spawn container → inject prompt → stream output → collect result  │
│   Manages per-task lifecycle: PENDING → RUNNING → BLOCKED → DONE    │
└────────┬────────────────────┬────────────────────────────────────────┘
         │                    │
┌────────▼──────────┐  ┌──────▼──────────────────────────────────────┐
│  Container        │  │   IPC / Question Surface Layer               │
│  Manager          │  │   Agent writes question to stdout/file →     │
│  Docker API,      │  │   executor detects → pauses task →           │
│  volume mounts,   │  │   pushes to CLI operator queue →             │
│  git worktree     │  │   operator answers → task resumes            │
│  per container    │  └─────────────────────────────────────────────┘
└────────┬──────────┘
         │
┌────────▼──────────────────────────────────────────────────────────┐
│                      Git Integration Layer                          │
│   Worktree-per-task isolation, branch management, merge/cleanup    │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| CLI Layer | Parse user commands, render status/questions, forward answers | Commander.js or Yargs + Ink (React for terminal) |
| Workflow Engine | Parse declarative config, build DAG, schedule node execution in dependency order | Custom DAG walker or Dagre; topological sort for ordering |
| Prompt Template Engine | Load templates, substitute variables, compose sections | Handlebars or custom tokenizer; file-based templates |
| Task Executor | Own task lifecycle state machine, spawn and monitor agent process, collect output | Node child_process or Dockerode; event-driven state machine |
| Container Manager | Docker container lifecycle: create, start, exec, stop, remove; volume mounts | Dockerode (Node Docker SDK); one container per task |
| IPC / Question Surface | Detect agent-emitted questions, pause task, queue for CLI, relay answer back | Named pipe, Unix socket, or stdout pattern matching + file polling |
| State Store | Persist run state, node outputs, pending questions across CLI calls | SQLite via better-sqlite3, or append-only JSON/NDJSON files |
| Git Integration | Create worktree per task, track branch, clean up or merge on completion | simple-git or direct git CLI via execa |

## Recommended Project Structure

```
src/
├── cli/                     # CLI entry points and output rendering
│   ├── commands/            # One file per command: run, status, answer, cancel
│   └── renderer.ts          # Terminal output formatting (no TUI — plain stdout)
├── workflow/                # Workflow engine: DAG parsing and scheduling
│   ├── parser.ts            # YAML/JSON → internal graph model
│   ├── graph.ts             # DAG data structures and topological sort
│   ├── scheduler.ts         # Fan-out concurrent execution, dependency resolution
│   └── types.ts             # WorkflowNode, Edge, RunContext interfaces
├── executor/                # Task lifecycle management
│   ├── task-executor.ts     # State machine: PENDING→RUNNING→BLOCKED→DONE
│   ├── agent-runner.ts      # Spawn Claude Code process, stream output
│   └── output-parser.ts     # Detect question patterns in agent stdout
├── container/               # Docker container lifecycle
│   ├── container-manager.ts # Create/start/stop/remove containers via Dockerode
│   ├── volume-builder.ts    # Mount codebase into container (read or copy)
│   └── config.ts            # Docker image config, resource limits
├── ipc/                     # Inter-process communication for question surfacing
│   ├── question-queue.ts    # Enqueue/dequeue pending questions
│   ├── channel.ts           # Named pipe or unix socket abstraction
│   └── types.ts             # Question, Answer interfaces
├── templates/               # Prompt template engine
│   ├── engine.ts            # Variable substitution + section composition
│   ├── loader.ts            # File-based template discovery and loading
│   └── types.ts             # Template, Section, Context interfaces
├── git/                     # Git integration
│   ├── worktree.ts          # Create/destroy per-task git worktrees
│   ├── branch.ts            # Branch naming, merge-back strategy
│   └── types.ts             # GitContext interfaces
├── state/                   # Run state persistence
│   ├── store.ts             # Read/write run state (SQLite or JSON files)
│   ├── run.ts               # Run entity: nodes, outputs, status
│   └── migrations.ts        # Schema migrations if using SQLite
└── types/                   # Shared domain types
    └── index.ts
```

### Structure Rationale

- **cli/:** Thin layer. Commands parse argv and delegate to engine. No business logic here.
- **workflow/:** The scheduler is the orchestrator brain. Decoupled from execution so you can test DAG logic without containers.
- **executor/:** Owns the per-task state machine. Knows about agents but not Docker directly — delegates to container/.
- **container/:** Docker-specific concerns live here. Swappable if a different sandbox mechanism is added later.
- **ipc/:** Isolated because question surfacing is the trickiest real-time communication problem. Deserves its own module.
- **templates/:** Pure I/O processing with no side effects. Easy to test and extend.
- **git/:** Worktree operations are risky (corrupting a repo is bad). Isolated so they can be carefully tested.
- **state/:** Persistence is a cross-cutting concern but isolated here — everything else asks for state through this layer.

## Architectural Patterns

### Pattern 1: State Machine for Task Lifecycle

**What:** Each task instance runs through explicit states: `PENDING → RUNNING → BLOCKED_ON_QUESTION → RUNNING → DONE | FAILED`. Transitions are explicit functions, not implicit string assignments.

**When to use:** Whenever a process has multiple halting points (blocking on I/O, questions, failures). Makes task status queryable and restartable.

**Trade-offs:** Slightly more boilerplate than ad-hoc flags, but dramatically easier to reason about concurrency and recovery.

```typescript
type TaskStatus = 'pending' | 'running' | 'blocked' | 'done' | 'failed';

interface TaskState {
  id: string;
  status: TaskStatus;
  containerId?: string;
  pendingQuestion?: Question;
  output?: string;
  error?: string;
}

function transitionTask(state: TaskState, event: TaskEvent): TaskState {
  switch (state.status) {
    case 'pending':
      if (event.type === 'START') return { ...state, status: 'running', containerId: event.containerId };
      break;
    case 'running':
      if (event.type === 'QUESTION') return { ...state, status: 'blocked', pendingQuestion: event.question };
      if (event.type === 'COMPLETE') return { ...state, status: 'done', output: event.output };
      if (event.type === 'FAIL') return { ...state, status: 'failed', error: event.error };
      break;
    case 'blocked':
      if (event.type === 'ANSWER') return { ...state, status: 'running', pendingQuestion: undefined };
      break;
  }
  return state;
}
```

### Pattern 2: DAG Topological Scheduler

**What:** Build an in-memory directed acyclic graph from the workflow config. Walk nodes in topological order, fanning out nodes whose dependencies are satisfied concurrently.

**When to use:** Any multi-step workflow with declared dependencies. Essential for correctness: never run a node before its inputs are ready.

**Trade-offs:** Implementation takes 1-2 days to get right. Don't use a queue abstraction — queues don't encode dependency order natively.

```typescript
interface WorkflowNode {
  id: string;
  dependsOn: string[];    // node IDs this node waits for
  inputs: Record<string, string>;   // variable bindings from upstream outputs
  prompt: string;         // template name
}

// Simplified topological fan-out
async function scheduleRun(nodes: WorkflowNode[], context: RunContext): Promise<void> {
  const completed = new Set<string>();
  const running = new Map<string, Promise<NodeOutput>>();

  while (completed.size < nodes.length) {
    const ready = nodes.filter(n =>
      !completed.has(n.id) &&
      !running.has(n.id) &&
      n.dependsOn.every(dep => completed.has(dep))
    );
    for (const node of ready) {
      running.set(node.id, executeNode(node, context).then(output => {
        completed.add(node.id);
        running.delete(node.id);
        context.outputs.set(node.id, output);
        return output;
      }));
    }
    await Promise.race(running.values());
  }
}
```

### Pattern 3: Question Surfacing via Structured Stdout

**What:** Define a structured marker that Claude Code emits when it needs operator input (e.g., `__QUESTION__: <json>`). The executor watches the container's stdout stream for this marker. On detection: pause the task, write question to the state store, signal the CLI.

**When to use:** This is the recommended approach for v1 over named pipes or sockets because it requires no changes to Claude Code's internals — you just parse what it naturally writes.

**Trade-offs:** Fragile if Claude Code output changes format. A dedicated IPC socket is more robust long-term but harder to implement. Use stdout pattern matching for v1 and abstract behind an interface for easy swap.

```typescript
const QUESTION_MARKER = /^__QUESTION__:\s*(.+)$/m;

function parseAgentOutput(chunk: string): { question?: Question; text: string } {
  const match = chunk.match(QUESTION_MARKER);
  if (match) {
    return {
      question: JSON.parse(match[1]),
      text: chunk.replace(QUESTION_MARKER, '').trim(),
    };
  }
  return { text: chunk };
}
```

## Data Flow

### Workflow Execution Flow

```
CLI: agent-harness run workflow.yaml
    │
    ▼
Workflow Engine: parse YAML → build DAG → topological walk
    │
    ▼ (for each ready node)
Template Engine: load template + substitute variables from workflow config + prior node outputs
    │
    ▼
Task Executor: create task record in State Store (PENDING)
    │
    ▼
Container Manager: git worktree create → Docker container create+start → mount worktree
    │
    ▼
Agent Runner: exec Claude Code in container with rendered prompt → stream stdout
    │
    ├──────────────────────────────────────┐
    ▼                                      ▼
Normal output captured                 Question marker detected
    │                                      │
    ▼                                      ▼
Appended to task output               Task → BLOCKED
                                      Question → State Store
                                      CLI notified (polling or event)
                                           │
                                           ▼
                                      Operator: agent-harness answer <run-id>
                                      Answer written to State Store
                                      Answer injected back to container stdin
                                      Task → RUNNING
    │
    ▼
Task completes → output captured → State Store updated (DONE)
    │
    ▼
Workflow Engine: mark node complete → check downstream nodes → fan out next ready nodes
    │
    ▼
All nodes complete → CLI renders final summary
```

### State Management

```
State Store (SQLite or JSON)
    │
    ├── runs/             id, status, workflow_path, started_at, completed_at
    ├── tasks/            id, run_id, node_id, status, container_id, output, error
    ├── questions/        id, task_id, prompt, answer, asked_at, answered_at
    └── outputs/          task_id, node_id, key, value (for DAG input passing)

All components read/write through State Store:
  CLI           → reads run/task/question status for display
  Scheduler     → reads task status to determine readiness
  Task Executor → writes task status transitions
  IPC Layer     → writes questions, reads answers
  Git Layer     → reads task context for worktree naming
```

### Key Data Flows

1. **Variable passing between nodes:** Node A output stored in `outputs` table keyed by `(run_id, node_id, key)`. When Node B starts, scheduler resolves `{{ nodes.A.output }}` references by reading from this table before rendering the prompt.

2. **Question/answer round-trip:** Agent stdout → executor detects marker → question record written to state store → CLI poll detects pending question → operator provides answer at terminal → answer written to state store → executor detects answer → answer string sent to container stdin → agent continues.

3. **Concurrent task isolation:** Each task gets a named git worktree at `./worktrees/<run-id>-<node-id>`. Container mounts this worktree path. Concurrent tasks operate on independent filesystem trees derived from the same base branch.

## Build Order

The components have hard dependencies. Build in this order:

| Order | Component | Why This Order | Depends On |
|-------|-----------|---------------|------------|
| 1 | State Store | Everything else needs to persist state | Nothing |
| 2 | Git Integration | Worktrees needed before containers can mount | State Store |
| 3 | Container Manager | Need containers before running agents | Git Integration |
| 4 | Prompt Template Engine | Needed before tasks can be dispatched | Nothing (parallel with 1-3) |
| 5 | Task Executor (no IPC) | Wire state machine to container+git | Container Manager, State Store |
| 6 | IPC / Question Surface | Extends executor with blocking question support | Task Executor |
| 7 | Workflow Engine (single node) | DAG parser + scheduler for linear case | Task Executor, Template Engine |
| 8 | Workflow Engine (concurrency) | Fan-out, dependency resolution | State Store, Workflow Engine |
| 9 | CLI Layer | Surface all the above to user | All components |

**Critical insight:** Build a single-task happy path end-to-end before concurrency. A linear `run one node → get output` flow exercises every component boundary. Concurrency is an extension of that, not a separate system.

## Anti-Patterns

### Anti-Pattern 1: Embedding Concurrency Logic in the Executor

**What people do:** Build the task executor with concurrency as a core concern — managing semaphores, worker pools, and scheduling all in one class.

**Why it's wrong:** The executor should own exactly one task's lifecycle. Concurrency is the scheduler's responsibility. Mixing them makes both harder to test and reason about, and makes it nearly impossible to add sequential fallback modes.

**Do this instead:** Executor = one task. Scheduler = N tasks. Scheduler calls executor N times concurrently. They communicate only through the state store.

### Anti-Pattern 2: Shared Filesystem Between Concurrent Tasks

**What people do:** Mount the same working directory into all containers, relying on git status to keep things separate.

**Why it's wrong:** Concurrent agents writing to the same filesystem (even different files) will collide on metadata, lock files, and build artifacts. Git operations from multiple processes on the same worktree corrupt the index.

**Do this instead:** Git worktree-per-task. Each container gets its own filesystem path derived from the base branch. Merge or discard after the task completes.

### Anti-Pattern 3: Polling State via Container Logs

**What people do:** Detect question state by repeatedly `docker logs` polling in a tight loop.

**Why it's wrong:** High CPU, adds latency to question detection, and creates race conditions when log lines span chunk boundaries.

**Do this instead:** Attach to container stdout as a stream (Dockerode `container.attach()`). Process chunks as they arrive. Buffer partial lines to handle chunk boundary splits before pattern matching.

### Anti-Pattern 4: Workflow Config as Code

**What people do:** Define workflows programmatically (callback chains, builder pattern) instead of as declarative data.

**Why it's wrong:** Programmatic workflows can't be version-controlled as simple data, can't be validated without executing, and tightly couple workflow definition to the harness implementation.

**Do this instead:** YAML/JSON workflow config with a schema. The engine parses and validates before execution. Config is data, not code.

### Anti-Pattern 5: Storing Agent Full Output in the Database

**What people do:** Write every byte of agent stdout into the state store (SQLite TEXT columns or JSON files).

**Why it's wrong:** Agent outputs can be megabytes. Databases are not log stores. This causes slow queries, large database files, and makes streaming status updates awkward.

**Do this instead:** Write output to a per-task log file on disk (e.g., `./runs/<run-id>/tasks/<task-id>.log`). Store only the file path and a short summary/result in the database. Stream the log file for live output display.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Docker Engine | Dockerode SDK (REST over Unix socket) | Requires Docker daemon running locally. Socket at `/var/run/docker.sock`. |
| Claude Code | Exec'd as CLI process inside container | Command: `claude` or `claude-code`. Prompt via stdin or file argument. Output via stdout. |
| Git | `simple-git` or `execa` wrapping git CLI | Worktree operations. Do NOT use libgit2 bindings — operational complexity not worth it for v1. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI ↔ Workflow Engine | Direct function call (same process) | CLI is thin; no IPC needed between them |
| Workflow Engine ↔ Task Executor | Direct async call + State Store for status | Scheduler calls executor; status is read from store, not return values |
| Task Executor ↔ Container Manager | Direct async call | Executor owns container lifecycle; Container Manager is a service injected into Executor |
| Task Executor ↔ IPC Layer | Event emitter or callback | Executor registers listener; IPC fires when question detected |
| IPC Layer ↔ State Store | Direct write/read | Questions written to store; answers polled from store |
| All components ↔ State Store | Service injection | Store passed as dependency; nothing imports store directly except via interface |

## Scaling Considerations

This is a local CLI tool. "Scale" here means concurrent tasks on a single developer machine, not distributed load.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-5 concurrent tasks | Default design. SQLite handles this fine. One Docker container per task. |
| 5-20 concurrent tasks | Add container resource limits (CPU/memory) to prevent machine thrashing. Add a concurrency cap configurable in the workflow file. |
| 20+ concurrent tasks | Unlikely for a local machine. If needed: queue-based task dispatch instead of fan-out. Consider container reuse (warm pool) to reduce startup overhead. |

### Scaling Priorities

1. **First bottleneck:** Container startup latency. Each Docker container takes 1-3s to start. For workflows with many short tasks, this dominates. Mitigation: pre-pull images, consider container reuse for same-image tasks.

2. **Second bottleneck:** Disk I/O from concurrent git worktrees on the same repository. Mitigation: workrees on separate physical paths (SSD helps). Avoid running 10+ concurrent worktrees on spinning disk.

## Sources

- Architecture patterns drawn from training knowledge of: Temporal.io workflow engine design, Dagger CI pipeline engine, LangGraph agent orchestration, Inngest event-driven functions, and general Node.js CLI tool patterns (Oclif, Commander.js ecosystems). Confidence: MEDIUM — these are well-established patterns but specific API details should be verified during implementation.
- Docker SDK: Dockerode on npm — verify current API at https://github.com/apocas/dockerode
- Git worktree documentation: https://git-scm.com/docs/git-worktree
- Node.js child_process streaming: https://nodejs.org/api/child_process.html

---
*Architecture research for: coding agent orchestration / harness CLI*
*Researched: 2026-03-04*
