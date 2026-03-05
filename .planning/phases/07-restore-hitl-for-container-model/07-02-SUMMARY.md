---
phase: 07-restore-hitl-for-container-model
plan: 02
subsystem: hitl
tags: [cli, ipc, question-store, worktree, answer-command]

# Dependency graph
requires:
  - phase: 07-restore-hitl-for-container-model
    provides: agent-runner.js with HITL interception, host-side question polling in TaskExecutor
  - phase: 02-single-task-execution
    provides: QuestionStore file-based IPC, answerCommand, CLI program structure
provides:
  - QuestionStore.forWorktree() static factory for flat worktree-based IPC paths
  - answer CLI command with --path option for worktree-based HITL
  - Copy-pasteable answer command logged by TaskExecutor with --path flag
  - Complete HITL loop: question.json (container) -> CLI surfacing (host) -> answer.json (CLI) -> agent resumes (container)
affects: [workflow-engine-hitl, multi-node-concurrent-hitl]

# Tech tracking
tech-stack:
  added: []
  patterns: [flat-directory IPC via forWorktree factory, CLI --path flag for worktree targeting]

key-files:
  created:
    - src/cli/answer.test.ts
  modified:
    - src/hitl/question-store.ts
    - src/hitl/question-store.test.ts
    - src/cli/answer.ts
    - src/cli/index.ts
    - src/executor/executor.ts

key-decisions:
  - "QuestionStore flat mode via constructor boolean -- forWorktree sets flat=true so runDir ignores runId and returns baseDir directly"
  - "answerCommand throws instead of process.exit when --path is provided -- enables testability without mocking process.exit"
  - "Executor answer hint includes --path <worktreePath> for direct copy-paste by operator"

patterns-established:
  - "Static factory forWorktree() over constructor overload -- clearer API intent for worktree-based IPC"
  - "CLI options object passed through commander action to command function -- {path?: string} pattern"

requirements-completed: [EXEC-03]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 7 Plan 02: Answer CLI and QuestionStore Worktree Adaptation Summary

**QuestionStore.forWorktree flat-path IPC and answer CLI --path flag completing the container HITL loop**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T07:59:20Z
- **Completed:** 2026-03-05T08:01:20Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added QuestionStore.forWorktree() static factory that creates flat-path stores mapping to worktreePath/.harness/ (no runId subdirectory)
- Updated answerCommand to accept optional --path flag, using forWorktree when provided and falling back to temp dir behavior without it
- Wired --path option into CLI commander program for the answer subcommand
- Updated TaskExecutor question surfacing log to include --path <worktreePath> for copy-paste convenience
- Full HITL loop complete: agent writes question.json in container -> host polls and surfaces -> operator runs answer CLI with --path -> answer.json written to worktree -> agent resumes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add worktree-path support to QuestionStore and adapt answer command** - `4da85e2` (feat)
2. **Task 2: Wire answer command path into CLI and update executor answer hint** - `414c5d9` (feat)

## Files Created/Modified
- `src/hitl/question-store.ts` - Added flat boolean, forWorktree() static factory, updated runDir
- `src/hitl/question-store.test.ts` - Added forWorktree describe block (runDir, submitAnswer, getQuestion tests)
- `src/cli/answer.ts` - Added options parameter with path support, throws instead of exit when --path provided
- `src/cli/answer.test.ts` - New test file for answer command with --path flag (3 tests)
- `src/cli/index.ts` - Added --path option to answer subcommand
- `src/executor/executor.ts` - Updated answer hint log to include --path <worktreePath>

## Decisions Made
- QuestionStore flat mode via constructor boolean: forWorktree sets flat=true so runDir ignores runId and returns baseDir directly. Simplest approach without breaking backward compatibility.
- answerCommand throws instead of process.exit when --path is provided: enables testability without mocking process.exit, while keeping exit behavior for CLI backward compat.
- Executor answer hint includes --path worktreePath: operator can copy-paste the full command directly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- HITL loop is fully wired end-to-end for the container model
- Phase 7 is complete: all requirements (EXEC-02 from Plan 01, EXEC-03 from Plan 02) satisfied
- Full test suite passes: 112 tests across 14 files with 0 failures

---
*Phase: 07-restore-hitl-for-container-model*
*Completed: 2026-03-05*
