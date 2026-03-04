# Project Research Summary

**Project:** Agent Harness
**Domain:** CLI tool for coding agent orchestration with Docker isolation and concurrent workflow execution
**Researched:** 2026-03-04
**Confidence:** MEDIUM

## Executive Summary

Agent Harness is a CLI-first orchestration tool that runs coding agents (primarily Claude Code) inside isolated Docker containers, executing declarative YAML-defined workflow graphs concurrently across git-isolated task branches. The closest analogues are LangGraph (graph semantics, Python-first), GitHub Actions (YAML DAG, containers, approval gates), and Temporal (durable workflow execution) — but no existing tool combines declarative YAML workflows, container-per-task isolation, concurrent execution, and human-in-the-loop question surfacing in a single local CLI. This gap is the core value proposition.

The recommended approach centers on a layered Node.js/TypeScript architecture: a thin CLI layer delegates to a DAG-based workflow engine, which fans out concurrent tasks to isolated Docker containers via a per-task state machine. Each task gets its own git worktree (filesystem isolation) and Docker container (process/tool isolation). A structured IPC channel between container and host handles human-in-the-loop question surfacing without blocking parallel tasks. All workflow state is persisted to disk from the first node so that resume-after-crash is a first-class capability, not a retrofit.

The dominant risk pattern in this class of tool is infrastructure leakage under failure: zombie containers, orphaned git worktrees, and lost workflow state. The second major risk is the IPC channel — if stdout parsing is used as a shortcut for agent communication, bidirectional messaging (question/answer, progress events) becomes impossible to retrofit cleanly. Both risks are architectural: they must be addressed in the foundation phase, not added later. The third risk is agent output parsing brittleness — text-based extraction from LLM output breaks silently and must be defended with structured output markers and explicit parse failures.

## Key Findings

### Recommended Stack

The stack is Node.js 22.x LTS with TypeScript 5.x throughout. The entire project must be ESM-native from day one — `execa`, `p-queue`, and `chalk` (all core dependencies) are ESM-only, and retrofitting a CJS project to ESM is expensive. Docker integration uses `dockerode` (Docker Engine API over Unix socket, no subprocess shelling). Workflow concurrency uses `p-queue` for in-process task queuing. Git operations use `simple-git` (worktree support is a hard requirement; `isomorphic-git` lacks it). Schema validation uses `zod` for YAML config loading with TypeScript inference. The IPC channel between container and host should use a Unix domain socket or local HTTP server — not raw stdout parsing.

**Core technologies:**
- Node.js 22.x LTS + TypeScript 5.x: runtime and language — type safety is non-negotiable for complex workflow graph types and container state machines
- Commander.js 12.x: CLI framework — de-facto standard, clean TypeScript ergonomics, no plugin overhead
- dockerode 4.x: Docker SDK — wraps Engine API directly, supports streaming attach and typed responses
- simple-git 3.x: Git integration — typed promise-based wrapper; the only Node.js option with worktree support
- Zod 3.x: schema validation — TypeScript inference from schema eliminates manual type duplication
- p-queue 8.x: concurrent task queue — simple concurrency limits without Redis overhead
- execa 9.x: subprocess execution — typed, ESM-native replacement for raw child_process
- eventemitter3 5.x: internal event bus — typed events between workflow engine, container manager, and CLI
- pino 9.x: structured logging — JSON-first, 5-10x faster than Winston, essential for CI/non-interactive use
- chalk 5.x + ora 8.x: terminal output — color-coded status from day one; defer `ink` until `console.log` output becomes unreadable

See `.planning/research/STACK.md` for full alternatives analysis and version compatibility notes.

### Expected Features

The MVP validation question is: can the harness run concurrent isolated agent tasks with human oversight? Everything in v1 serves that proof. Conditional routing, typed node contracts, and composable prompts are v1.x enhancements added after the core is proven.

**Must have (table stakes):**
- CLI entry point with subcommands (`run`, `status`, `answer`, `cancel`) — scriptable, pipeable, CI-compatible
- YAML workflow config with node/edge definition — declarative, version-controlled alongside code
- Prompt template system with variable substitution — parameterized prompts are a baseline expectation
- Container-based isolation per task (Docker) — core safety guarantee, the primary differentiator
- Concurrent task execution (N tasks in parallel) — validates the central value proposition
- Git branch per task (worktree or clone) — enables concurrent writes to the same codebase
- Human-in-the-loop question surfacing (pause/resume) — validates the safety mechanism
- Structured logging and execution trace — operators must see what happened
- Graceful shutdown with container cleanup — Ctrl+C must not leave zombie containers
- Error propagation with exit codes — required for any CI/CD integration

**Should have (competitive differentiators):**
- Conditional routing in workflow graph — branching beyond linear execution (e.g., "if tests fail, route to debug node")
- Typed node contracts with schema validation — catch config errors at parse time, not 10 minutes into a run
- Task retry with context enrichment — inject prior failure output into retry prompt, not naive "run again"
- Workspace snapshot/restore — git tag before destructive workflow, restore on failure
- Composable prompt sections — reusable prompt components beyond simple variable substitution

**Defer (v2+):**
- Pluggable agent adapters (Aider, GPT Engineer) — validate Claude Code integration fully before abstracting
- OpenTelemetry event emission — overkill until users have observability pipelines to connect
- `--non-interactive` CI mode — need to understand CI integration patterns before designing the flag
- Web UI / dashboard — CLI-first; rich terminal output is sufficient for v1
- Multi-agent delegation — dramatically increases permission model and IPC complexity

See `.planning/research/FEATURES.md` for full prioritization matrix and competitor analysis.

### Architecture Approach

The architecture is a layered pipeline: CLI layer (Commander.js, thin, no business logic) → Workflow Engine (DAG parser + topological scheduler) → Task Executor (per-task state machine: PENDING → RUNNING → BLOCKED → DONE) → Container Manager (dockerode, one container per task) + IPC Layer (question surfacing) + Git Integration (worktree per task). A central State Store (SQLite or append-only JSON) is the single source of truth that all components read and write through — never in-memory-only. Build order is strictly determined by dependencies: State Store first, then Git, then Container Manager (parallel with Prompt Template Engine), then Task Executor, then IPC, then Workflow Engine (single-node then concurrent), then CLI layer last.

**Major components:**
1. State Store (SQLite/JSON) — persists run state, node outputs, pending questions; foundation everything else depends on
2. Workflow Engine (DAG) — parses YAML config, builds graph, walks topologically, fans out concurrent tasks
3. Task Executor (state machine) — owns one task's full lifecycle; delegates to Container Manager and IPC
4. Container Manager (dockerode) — Docker container create/start/stop/remove; volume mounts; resource limits
5. IPC / Question Surface Layer — structured message channel (Unix socket or local HTTP) between container agent and host CLI; never stdout parsing
6. Git Integration (simple-git) — worktree-per-task isolation, branch management, conflict detection before merge
7. Prompt Template Engine — variable substitution + section composition; two-level max to prevent template hell
8. CLI Layer (Commander.js) — thin command dispatch and terminal rendering; no business logic

See `.planning/research/ARCHITECTURE.md` for full component diagram, data flow, and anti-patterns.

### Critical Pitfalls

1. **Container lifecycle leaks under failure** — Persist container IDs to a lockfile at creation time; on CLI startup, reap any containers from prior crashed runs. SIGKILL cannot be caught; startup-reap is the only defense. Set resource limits on every container. Address in: container execution foundation phase.

2. **IPC channel designed as an afterthought** — Define the host-container message envelope (`{ type, correlationId, payload }`) before writing the first container. Use a Unix domain socket or local HTTP server. Never parse stdout for control flow — stdout is for human-readable logs only. Retrofitting this is expensive. Address in: container execution foundation phase.

3. **Deadlock in human-in-the-loop question surfacing** — Treat question delivery as an async message queue, not synchronous RPC. The task emits a question event with a correlation ID; the host delivers it independently. Implement a question timeout. The CLI display loop must handle multiple concurrent pending questions. Address in: IPC / human-in-the-loop phase.

4. **Workflow state not persisted (no resume after crash)** — Persist workflow execution state to disk after every node transition from day one. Support `agent-harness resume <run-id>` as a first-class command. State file writes must be atomic (write to `.tmp`, then rename). In-memory-only state is never acceptable — recovery cost is HIGH. Address in: workflow execution engine phase.

5. **Agent output parsing brittleness** — Instruct the agent to emit structured output in a versioned machine-readable block (e.g., `HARNESS_OUTPUT_V1: {...}`). Never silently fall back to a default on parse failure — fail the task loudly. Build a parser test corpus of real agent outputs. Address in: workflow execution / agent output handling phase.

Additional significant pitfalls: git conflict corruption when merging concurrent task branches (require dry-run conflict detection before consuming any task output), workflow graph cycle detection (validate at parse time with DFS, reject cyclic graphs without explicit `max_iterations`), Claude config isolation per container (ephemeral per-task config directory, only API key shared as env var), and prompt template combinatorial explosion (enforce two-level maximum depth, ship `template render --dry-run` from day one).

See `.planning/research/PITFALLS.md` for full pitfall catalog, technical debt patterns, security mistakes, and recovery strategies.

## Implications for Roadmap

Based on the architectural build-order dependency chain and pitfall-to-phase mapping, the natural phase structure is:

### Phase 1: Foundation — State, Git, and Container Infrastructure

**Rationale:** The State Store, Git integration, and Container Manager have no upward dependencies and everything else depends on them. The IPC protocol must also be designed here, not later — the pitfall research is explicit that retrofitting it is expensive. This phase establishes the two non-negotiable foundations: container cleanup safety (lockfile-based reap) and the structured IPC envelope.

**Delivers:** A working container that can be created, have a Claude Code process exec'd inside it, and be cleaned up reliably under all failure modes (including SIGKILL). Git worktree creation and cleanup. State persistence for run/task records. IPC message envelope protocol defined and implemented (even if only a stub agent uses it).

**Addresses:** CLI entry point scaffolding, error propagation with exit codes, graceful shutdown, environment variable passthrough.

**Avoids:** Container lifecycle leaks (Pitfall 1), IPC afterthought (Pitfall 7), concurrent task filesystem collision (Anti-Pattern 2).

**Research flag:** Needs phase research — Claude Code's actual invocation model inside a container (stdin/stdout/subprocess flags) needs verification against current SDK docs before implementation.

### Phase 2: Single-Task Execution — Happy Path End-to-End

**Rationale:** Architecture research is explicit: build a single-task happy path before concurrency. A linear "run one node → get output" flow exercises every component boundary and validates all foundation work. Discovering integration bugs at single-task scale is far cheaper than discovering them during concurrent execution.

**Delivers:** `agent-harness run workflow.yaml` with a single-node workflow executes Claude Code in a container, captures structured output, persists the result, and exits with a correct exit code. Prompt template variable substitution working. Basic structured logging visible.

**Addresses:** YAML workflow config loading, prompt template system, task execution with captured output, structured logging.

**Avoids:** Agent output parsing brittleness (Pitfall 5 — establish structured output marker protocol here), prompt template combinatorial explosion (Pitfall 4 — enforce two-level model from the start).

**Research flag:** Standard patterns for this phase — YAML parsing with Zod, Commander.js subcommands, and file-based template loading are well-documented.

### Phase 3: Human-in-the-Loop Question Surfacing

**Rationale:** HITL is a primary differentiator and the highest-complexity IPC problem. It must be validated at single-task scale before concurrency, because the deadlock failure mode (Pitfall 2) is much harder to diagnose when multiple tasks are running simultaneously. The IPC channel foundation from Phase 1 is extended here to handle bidirectional question/answer flow.

**Delivers:** A running task pauses and surfaces a question to the CLI operator. The operator runs `agent-harness answer <run-id>` to provide an answer. The task resumes and completes. The question/answer round-trip uses the structured IPC channel, not stdout parsing.

**Addresses:** Human-in-the-loop question surfacing (P1 feature), task pause/resume mechanism, IPC question queue.

**Avoids:** HITL deadlock (Pitfall 2 — async message queue, not synchronous RPC; timeout on unanswered questions), IPC afterthought (Pitfall 7 — using the proper channel designed in Phase 1).

**Research flag:** Needs phase research — Claude Code's mechanism for emitting questions to an orchestrator (SDK events vs. stdout markers vs. file-based signaling) needs current documentation verification.

### Phase 4: Concurrent Execution and Git Isolation

**Rationale:** Concurrency is an extension of single-task execution, not a separate system. With single-task + HITL proven, adding concurrent execution via the DAG scheduler and worktree-per-task isolation completes the core value proposition. This phase also introduces merge conflict detection — required before any concurrent workflow output is consumed by downstream nodes.

**Delivers:** Multiple workflow nodes with no shared dependencies fan out and execute concurrently in separate containers with separate git worktrees. The CLI shows live status for all running tasks. Merge conflict detection runs before node output is passed to downstream nodes.

**Addresses:** Concurrent task execution (P1), git branch per task (P1), DAG topological scheduler, fan-out execution with p-queue, concurrency cap configuration.

**Avoids:** Concurrent task filesystem collision (Anti-Pattern 2), git conflict corruption (Pitfall 3 — dry-run merge check before consuming output), shared Docker config directory between containers (Pitfall 9).

**Research flag:** Standard patterns — git worktree management and p-queue concurrency are well-documented. The merge conflict detection strategy may need a phase research spike.

### Phase 5: Workflow Robustness — Validation, Resume, and Graph Features

**Rationale:** With core execution proven, harden the workflow engine with the v1.x features that prevent operational pain: cycle detection at parse time, resume after crash, conditional routing, and typed node contracts. These features are grouped because they all touch the workflow engine and state persistence layers.

**Delivers:** `agent-harness resume <run-id>` resumes a workflow from the last completed node after a crash. Cyclic workflow graphs are rejected at parse time with a clear error message including the cycle path. Typed node contracts validate edge compatibility at load time. Conditional routing dispatches to different downstream nodes based on task output values.

**Addresses:** Conditional routing in workflow graph (P2), typed node contracts (P2), state persistence and resume (foundational correctness), workspace snapshot/restore (P2).

**Avoids:** Workflow state not persisted (Pitfall 6), workflow graph cycles (Pitfall 8), agent output parsing for routing decisions.

**Research flag:** Standard patterns — topological sort, DFS cycle detection, and SQLite state management are well-documented.

### Phase 6: Polish — CLI Experience and Observability

**Rationale:** UX hardening, error message quality, and observability features are deferred until the core execution model is stable. Adding ink (rich terminal output) before the execution model is stable creates unnecessary churn.

**Delivers:** Live status board for concurrent tasks (task ID, node name, elapsed time, last event). Human-readable Docker error messages with remediation hints. YAML validation errors with line-level key paths. `template render --dry-run` command. Structured execution event log per run. `agent-harness cleanup` command to reap orphaned containers.

**Addresses:** Structured execution events (observability), rich terminal output (ink or chalk/ora), UX pitfalls from PITFALLS.md.

**Avoids:** UX pitfalls (wall-of-text questions, cryptic Docker errors, scattered output), performance traps (Docker polling loop → event streaming).

**Research flag:** Standard patterns — this phase is primarily polishing known components.

### Phase Ordering Rationale

- **Foundation before features:** State Store, Container Manager, and IPC protocol are hard prerequisites for everything else. Building them first prevents expensive retrofits.
- **Single-task before concurrent:** Architecture research prescribes this explicitly. Concurrency multiplies bugs; validate the component interfaces at single-task scale first.
- **HITL before concurrent:** HITL deadlocks are much harder to diagnose under concurrency. Prove the question/answer round-trip at single-task scale before introducing parallel blocking tasks.
- **Core execution before robustness:** Resume, cycle detection, and conditional routing are enhancements to a working system. They require a stable execution model to build on.
- **Polish last:** Terminal output and error message quality improve iteratively. Deferring ink until Phase 6 prevents premature investment in UI before the execution model stabilizes.

### Research Flags

Phases likely needing `/gsd:research-phase` deeper research during planning:
- **Phase 1 (Container Foundation):** Claude Code's actual invocation model inside a container — stdin/stdout/file argument for prompt injection, subprocess flags, and output format — needs current SDK documentation verification. The `@anthropic-ai/claude-code` npm package existence and API should be confirmed before deciding subprocess vs. SDK approach.
- **Phase 3 (HITL Question Surfacing):** Claude Code's mechanism for signaling a question to an orchestrator is MEDIUM-confidence from training data. Verify the current SDK event model (does it expose a hook? does it write to stdout? does it support a callback?) before committing to the IPC implementation.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Single-Task Execution):** YAML + Zod validation, Commander.js subcommands, file-based template loading — all well-documented with established patterns.
- **Phase 4 (Concurrent Execution):** p-queue concurrency, git worktree management — well-documented; git worktree conflict detection may need a small spike.
- **Phase 5 (Workflow Robustness):** DFS cycle detection, topological sort, SQLite state — standard algorithms and libraries.
- **Phase 6 (Polish):** Terminal output libraries and Docker event streaming are well-documented.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Technology choices are HIGH confidence (well-established ecosystem). Version numbers are MEDIUM — run `npm show <package> version` before pinning. ESM-native setup is HIGH confidence direction. |
| Features | MEDIUM | Container isolation, git-native tracking, and HITL patterns are HIGH confidence (well-established). Claude Code SDK-specific behavior for question surfacing is LOW confidence — needs current doc verification. |
| Architecture | MEDIUM | Component decomposition and build order are HIGH confidence (drawn from Temporal, Dagger, LangGraph patterns). Specific Docker/Claude Code API integration details need verification during Phase 1. |
| Pitfalls | HIGH | Container lifecycle, concurrent state management, and IPC design pitfalls are HIGH confidence (widely documented operational patterns). Claude Code SDK-specific behavior is MEDIUM. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Claude Code invocation model in containers:** How is Claude Code invoked inside a Docker container? What flags does it accept for non-interactive mode? Does it support JSON-structured output? This is the single most important unknown before Phase 1 implementation. Verify against current Claude Code documentation or the `@anthropic-ai/claude-code` npm package.

- **Claude Code question-surfacing API:** How does Claude Code signal that it needs operator input? Does it expose an SDK hook, write a structured marker to stdout, or use a callback interface? This determines the IPC architecture for Phase 3. LOW confidence from training data alone.

- **IPC channel choice (HTTP vs. Unix socket):** The research supports both a local HTTP server (simpler, stateless request/response) and a Unix domain socket (lower latency, bidirectional). The choice depends on whether cancellation signals need to be pushed back to the container during a run. Decide during Phase 1 design.

- **npm package versions:** All version numbers in STACK.md are from training data through August 2025. Run `npm show <package> version` for each dependency before finalizing `package.json`.

- **Docker image for Claude Code:** A pre-built base image containing Claude Code reduces container startup latency from 30-120s (image build) to 1-3s (container start). Whether an official Claude Code Docker image exists (or needs to be built) is unverified.

## Sources

### Primary (HIGH confidence)
- Training data through August 2025: Docker container lifecycle management, git worktree documentation, Node.js child_process streaming, concurrent system design patterns — HIGH confidence for architectural patterns
- npm ecosystem: Commander.js, dockerode, p-queue, execa, simple-git, Zod — HIGH confidence for technology choices; MEDIUM for specific versions

### Secondary (MEDIUM confidence)
- LangGraph, AutoGen, CrewAI documentation and issue trackers — agent orchestration patterns, HITL deadlock cases, state management
- Temporal.io and Prefect workflow engine architecture — state persistence, resume, cycle detection patterns
- Dagger CI pipeline engine design — container-per-task isolation patterns
- Inngest event-driven functions — event sourcing patterns for workflow state

### Tertiary (LOW confidence — needs validation)
- Claude Code SDK behavior (streaming output, question surfacing, subprocess model) — based on public documentation through August 2025; verify current SDK event model before implementation
- `@anthropic-ai/claude-code` npm package API — existence and interface unconfirmed; verify before depending on it

---
*Research completed: 2026-03-04*
*Ready for roadmap: yes*
