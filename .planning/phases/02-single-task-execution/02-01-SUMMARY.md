---
phase: 02-single-task-execution
plan: 01
subsystem: hitl
tags: [hitl, ipc, yaml, zod, vitest, file-polling, question-store, workflow-parser]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: src/types/index.ts shared type system, ESM/NodeNext project structure, vitest test setup

provides:
  - QuestionStore class (src/hitl/question-store.ts) — file-based IPC for HITL question/answer using question.json / answer.json
  - YAML workflow parser (src/workflow/parser.ts) — zod-validated parseWorkflow returning typed WorkflowDef
  - Phase 2 shared types in src/types/index.ts — QuestionRecord, AnswerRecord, NodeDef, EdgeDef, WorkflowDef, TaskResult, RunState
  - WorkflowDefSchema, NodeDefSchema, EdgeDefSchema exported from parser for reuse

affects:
  - 02-02 task-executor (imports QuestionStore for HITL callbacks)
  - 02-03 workflow-runner (imports parseWorkflow for workflow loading)
  - Any phase reading workflow YAML files

# Tech tracking
tech-stack:
  added: [yaml@^2.x, uuid@^9.x, @types/uuid]
  patterns:
    - File-based IPC using question.json / answer.json in /tmp/agent-harness/runs/{runId}/
    - 500ms polling loop with fs.unlink to consume answer (prevents stale pickup)
    - Zod schema-first type derivation: WorkflowDef = z.infer<typeof WorkflowDefSchema>
    - Vitest TDD — failing test first, minimal implementation for GREEN

key-files:
  created:
    - src/hitl/question-store.ts
    - src/hitl/question-store.test.ts
    - src/workflow/parser.ts
    - src/workflow/parser.test.ts
  modified:
    - src/types/index.ts

key-decisions:
  - "500ms polling interval chosen for askAndWait — balances responsiveness vs CPU overhead for interactive HITL"
  - "answer.json consumed (deleted) immediately after read — prevents stale answer pickup across runs; caller (executor) responsible for purging run dir on startup"
  - "submitAnswer verifies question.json exists before writing answer.json — prevents orphaned answers with no question"
  - "WorkflowDef exported as both a zod-inferred type (parser.ts) and a manual interface (types/index.ts) — they must stay in sync; zod-inferred type is the source of truth at runtime"
  - "yaml package used over js-yaml — actively maintained, TypeScript-first, ESM-native"
  - "nodes.min(1) enforced at zod schema level — workflow with no nodes is invalid by design"

patterns-established:
  - "File-based IPC: write question.json, poll for answer.json, unlink on read — pattern for all HITL interactions"
  - "Constructor injection of baseDir in QuestionStore — enables isolated tmpdir per test without env var hacks"
  - "mkdtemp per test suite + afterEach rm -rf — standard cleanup pattern for file I/O tests in vitest"

requirements-completed: [EXEC-02, EXEC-03, WKFL-01]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 2 Plan 01: Foundation Modules Summary

**File-based HITL QuestionStore (polling IPC) and zod-validated YAML workflow parser with 17 tests green**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-05T01:54:28Z
- **Completed:** 2026-03-05T01:56:40Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- QuestionStore with askAndWait (writes question.json, polls for answer.json, deletes on consume), submitAnswer, getQuestion, purgeRunDir — 8 tests green
- YAML workflow parser using zod schema validation with full error coverage (empty nodes, missing fields, invalid YAML, ENOENT) — 9 tests green
- Extended src/types/index.ts with 7 Phase 2 types: QuestionRecord, AnswerRecord, NodeDef, EdgeDef, WorkflowDef, TaskResult, RunState

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend shared types and build QuestionStore with file-based IPC** - `9baaa8a` (feat)
2. **Task 2: Build YAML workflow parser with zod schema validation** - `e99f9cd` (feat)

_Note: TDD tasks — tests written before implementation for both tasks_

## Files Created/Modified

- `src/types/index.ts` - Extended with Phase 2 types (QuestionRecord, AnswerRecord, NodeDef, EdgeDef, WorkflowDef, TaskResult, RunState)
- `src/hitl/question-store.ts` - QuestionStore class with file-based question/answer IPC
- `src/hitl/question-store.test.ts` - 8 unit tests covering all QuestionStore methods
- `src/workflow/parser.ts` - parseWorkflow function, zod schemas (NodeDefSchema, EdgeDefSchema, WorkflowDefSchema)
- `src/workflow/parser.test.ts` - 9 unit tests covering valid/invalid YAML, schema errors, ENOENT

## Decisions Made

- **500ms polling interval** — balances responsiveness for interactive HITL vs CPU overhead during waiting
- **answer.json consumed on read** — prevents stale answer pickup if a run crashes and restarts; purgeRunDir is available for full cleanup
- **submitAnswer verifies question.json** — guards against orphaned answers with no active question
- **WorkflowDef dual-export** — zod-inferred type in parser.ts is runtime source of truth; manual interface in types/index.ts for cross-module sharing
- **yaml package** — actively maintained, TypeScript-first, tree-shakeable vs js-yaml

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- QuestionStore ready for Task Executor (Plan 02-02) to call during HITL callbacks
- parseWorkflow ready for Workflow Runner (Plan 02-03) to load workflow YAML files
- All Phase 2 types exported from src/types/index.ts for downstream plans
- No blockers

---
*Phase: 02-single-task-execution*
*Completed: 2026-03-05*
