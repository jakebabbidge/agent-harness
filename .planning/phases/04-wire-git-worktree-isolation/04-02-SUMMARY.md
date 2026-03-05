---
phase: 04-wire-git-worktree-isolation
plan: 02
subsystem: cli
tags: [git, worktree, branch-tracker, cli, isolation]

# Dependency graph
requires:
  - phase: 04-wire-git-worktree-isolation
    provides: "RunWorkflowOptions with tracker/baseBranch fields, worktree lifecycle in runner.ts"
  - phase: 01-foundation
    provides: "BranchTracker, createWorktree, removeWorktree APIs"
provides:
  - "CLI entry points (run, resume) create and pass BranchTracker to execution pipeline"
  - "Template mode wraps execution with worktree create/cleanup lifecycle"
  - "Resume path loads persisted tracker state and cleans stale worktrees"
affects: [05-hitl-and-cli-polish, 06-integration-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns: ["shared runId/tracker creation before mode dispatch", "stale worktree cleanup on resume"]

key-files:
  created: []
  modified:
    - src/cli/run.ts
    - src/cli/resume.ts

key-decisions:
  - "Shared runId and BranchTracker created before workflow/template mode branch -- both paths use same tracker instance"
  - "Tracker state path uses os.tmpdir()/agent-harness/branches/${runId}.json -- consistent between run and resume"
  - "Stale worktree cleanup iterates nodes with status 'running' before resuming -- prevents branch-already-exists errors"

patterns-established:
  - "CLI-level tracker lifecycle: create tracker at CLI entry, pass down to runner/worktree layer"
  - "Resume-safe tracker: load() restores persisted state, cleanup removes stale worktrees before re-execution"

requirements-completed: [GIT-01, GIT-02]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 4 Plan 02: Wire CLI Entry Points Summary

**BranchTracker instantiation and worktree lifecycle wired into run.ts (workflow + template mode) and resume.ts with stale worktree cleanup**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T05:34:47Z
- **Completed:** 2026-03-05T05:36:26Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- run.ts creates shared BranchTracker and passes tracker/baseBranch to runWorkflow in workflow mode
- run.ts template mode wraps executor.executeTask with createWorktree/removeWorktree lifecycle
- resume.ts loads persisted BranchTracker state, cleans up stale worktrees from crashed runs, and passes tracker to runWorkflow

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire BranchTracker and worktrees into cli/run.ts** - `ea5f10c` (feat)
2. **Task 2: Wire BranchTracker into cli/resume.ts** - `685a0e5` (feat)

## Files Created/Modified
- `src/cli/run.ts` - BranchTracker instantiation, worktree lifecycle for template mode, tracker passed to runWorkflow
- `src/cli/resume.ts` - BranchTracker load from persisted state, stale worktree cleanup, tracker passed to runWorkflow

## Decisions Made
- Shared runId and BranchTracker created before workflow/template mode branch so both paths use same instance
- Tracker state path uses os.tmpdir()/agent-harness/branches/${runId}.json -- consistent convention between run and resume commands
- Stale worktree cleanup on resume iterates nodes with status 'running' before calling runWorkflow -- prevents "branch already exists" errors

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GIT-01 and GIT-02 requirements fully wired from CLI entry points through runner to git worktree layer
- Phase 04 complete -- all plans executed
- Ready for Phase 05 (HITL and CLI polish) or Phase 06 (integration hardening)

---
*Phase: 04-wire-git-worktree-isolation*
*Completed: 2026-03-05*
