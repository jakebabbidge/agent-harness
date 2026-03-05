---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Completed 07-02-PLAN.md
last_updated: "2026-03-05T08:02:01.962Z"
last_activity: "2026-03-05 — 07-02 complete: Answer CLI and QuestionStore worktree adaptation"
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 17
  completed_plans: 17
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Multiple concurrent coding agent tasks run in full isolation against a codebase, coordinated by a declarative workflow graph, with human oversight surfaced at the CLI when agents need input.
**Current focus:** Phase 7 — Restore HITL for Container Model

## Current Position

Phase: 7 of 7 (Restore HITL for Container Model)
Plan: 2 of 2 complete in current phase (07-02 complete)
Status: Complete
Last activity: 2026-03-05 — 07-02 complete: Answer CLI and QuestionStore worktree adaptation

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: ~2 min
- Total execution time: ~6 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | ~6 min | ~2 min |

**Recent Trend:**
- Last 5 plans: 01-01 (~1 min), 01-03 (~2 min), 01-02 (~3 min)
- Trend: —

*Updated after each plan completion*
| Phase 01-foundation P04 | 25 | 2 tasks | 3 files |
| Phase 02-single-task-execution P01 | 2 | 2 tasks | 5 files |
| Phase 02-single-task-execution P02 | 4min | 2 tasks | 6 files |
| Phase 02-single-task-execution P03 | 2min | 1 tasks | 4 files |
| Phase 02-single-task-execution P03 | 15min | 2 tasks | 6 files |
| Phase 03-concurrent-workflow-engine P01 | 2min | 3 tasks | 9 files |
| Phase 03 P02 | 4min | 1 tasks | 2 files |
| Phase 03 P03 | 2min | 2 tasks | 3 files |
| Phase 04 P01 | 2min | 2 tasks | 2 files |
| Phase 04 P02 | 2min | 2 tasks | 2 files |
| Phase 05 P01 | 3min | 3 tasks | 5 files |
| Phase 05 P02 | 2min | 3 tasks | 6 files |
| Phase 06 P01 | 145s | 2 tasks | 6 files |
| Phase 07 P01 | 207s | 2 tasks | 7 files |
| Phase 07 P02 | 2min | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Container isolation (Docker) chosen over worktrees-only; IPC protocol must be designed in Phase 1 — retrofitting is expensive
- [Roadmap]: Coarse granularity applied — 3 phases cover 16 requirements; research suggests Node.js/TypeScript ESM-native stack
- [01-01]: NodeNext module/moduleResolution chosen over bundler/ESNext — required for native Node.js ESM runtime (not bundler-transformed)
- [01-01]: src/types/index.ts is a zero-import leaf node — enforces clean dependency direction across all subsystems
- [01-01]: vitest@2.x chosen over jest — native ESM support without transform configuration
- [01-03]: Branch conflict: fail-fast (error on duplicate branch) rather than --force reuse — safer, prevents silent state corruption
- [01-03]: execFile over exec for git commands — eliminates shell injection surface
- [01-03]: Optional BranchTracker parameter on createWorktree/removeWorktree — enables isolated git-op unit tests
- [01-03]: Void-fire save() on mutations — persistence is best-effort, does not block synchronous register/unregister API
- [01-02]: Handlebars.create() per render call — prevents partial bleed between concurrent invocations
- [01-02]: Partial name from path.basename without extension — maps system-prompt.hbs to 'system-prompt' matching {{> system-prompt}} syntax
- [01-02]: Namespace import 'import * as Handlebars' required by esModuleInterop: false in tsconfig
- [01-02]: Test fixtures use mkdtemp unique dir + simple filenames so partial names match template references
- [Phase 01-foundation]: AutoRemove=true means harness must NOT call container.remove() after stop() — Docker daemon owns container cleanup on SIGKILL
- [Phase 01-foundation]: NetworkMode=none blocks DNS resolution entirely, not just TCP — wget: bad address confirms no outbound traffic possible
- [Phase 01-foundation]: Constructor injection for Dockerode instance — ContainerManager takes docker client in constructor, createContainerManager() factory wraps default
- [Phase 02-single-task-execution]: 500ms polling interval for askAndWait — balances responsiveness vs CPU overhead for interactive HITL
- [Phase 02-single-task-execution]: answer.json consumed (deleted) immediately after read — prevents stale answer pickup; purgeRunDir available for full cleanup
- [Phase 02-single-task-execution]: WorkflowDef dual-export: zod-inferred type in parser.ts as runtime source of truth; manual interface in types/index.ts for cross-module sharing
- [Phase 02-single-task-execution]: @anthropic-ai/claude-agent-sdk installed with --legacy-peer-deps; zod v3/v4 coexist at runtime since they serve separate subsystems
- [Phase 02-single-task-execution]: canUseTool callback intercepts AskUserQuestion only, passes all other tools through — minimal interruption pattern for HITL
- [Phase 02-single-task-execution]: bin/agent-harness.ts created as thin delegator to cli/index.ts — avoids changing package.json bin entry while allowing program.parse() to live in index.ts
- [Phase 02-single-task-execution]: API key guard placed before QuestionStore/TaskExecutor creation — prevents useless object creation when execution will fail
- [Phase 02-single-task-execution]: esModuleInterop enabled (true) to support Handlebars default import — namespace import broke .create() at runtime; prior decision log was incorrect
- [Phase 03-01]: createStateManager factory pattern for testable state directory scoping
- [Phase 03-01]: Kahn's algorithm with BFS waves for natural tier grouping
- [Phase 03-01]: Atomic write via tmp+rename for state corruption prevention
- [Phase 03]: Async mutex for serializing concurrent state file writes -- prevents race on shared tmp path
- [Phase 03-03]: Resume loads workflowDef from persisted state rather than re-parsing YAML -- avoids requiring workflow file at resume time
- [Phase 03-03]: Run command logs runId at start so user can copy it for resume if process is killed
- [Phase 04-01]: worktreeTaskId = runId.slice(0,8)-nodeId for cross-run and cross-node uniqueness
- [Phase 04-01]: Worktree creation outside try/catch, cleanup in finally -- ensures cleanup even on executor throw
- [Phase 04-01]: Backward compatible: nodes without repo skip worktree lifecycle entirely
- [Phase 04]: Shared runId and BranchTracker created at CLI level before mode dispatch -- consistent tracker lifecycle for both workflow and template paths
- [Phase 04]: Resume path loads persisted tracker state and cleans stale worktrees (status=running) before re-executing -- prevents branch-already-exists errors
- [Phase 05]: docker CLI build over dockerode.buildImage() -- simpler COPY/context handling
- [Phase 05]: Bridge networking + iptables firewall replaces NetworkMode:none -- allows whitelisted outbound traffic
- [Phase 05]: Container Cmd chains sudo init-firewall.sh then Claude CLI -- single process lifecycle with waitForExit()
- [Phase 05-02]: runId.slice(0,12) as container taskId -- fits Docker name constraints
- [Phase 05-02]: ContainerManager.docker exposed readonly for ensureImage access -- avoids duplicate Dockerode instances
- [Phase 05-02]: HITL/QuestionStore removed from executor -- not wired for container model, future design concern
- [Phase 07-01]: agent-runner.js uses deny+message for AskUserQuestion interception -- delivers answer text as denial message per Phase 2 pattern
- [Phase 07-01]: HARNESS_IPC_DIR env var controls IPC path -- enables nodeId-scoped subdirectories for future multi-node concurrent HITL
- [Phase 07-01]: Host-side polling uses 500ms interval with containerDone flag -- same proven interval from Phase 2
- [Phase 07-01]: Stale IPC file cleanup before container creation -- prevents stale question pickup from previous runs
- [Phase 07]: QuestionStore flat mode via constructor boolean -- forWorktree sets flat=true so runDir ignores runId and returns baseDir directly
- [Phase 07]: answerCommand throws instead of process.exit when --path provided -- enables testability
- [Phase 07]: Executor answer hint includes --path worktreePath for direct copy-paste by operator

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Claude Code invocation model inside a container is LOW-MEDIUM confidence — verify `@anthropic-ai/claude-code` npm package API and subprocess flags before committing to IPC architecture
- [Phase 2]: Claude Code question-surfacing mechanism (SDK hook vs. stdout marker vs. file signal) is LOW confidence — needs verification before Phase 2 HITL implementation

## Session Continuity

Last session: 2026-03-05T08:02:01.959Z
Stopped at: Completed 07-02-PLAN.md
Resume file: None
