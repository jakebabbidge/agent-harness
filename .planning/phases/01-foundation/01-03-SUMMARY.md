---
phase: 01-foundation
plan: 03
subsystem: git
tags: [git, worktree, typescript, esm, vitest, tdd, child_process]

# Dependency graph
requires:
  - phase: 01-01
    provides: TypeScript ESM scaffold, shared types (TaskId, WorktreeInfo), vitest runner
provides:
  - createWorktree(repoPath, taskId, baseBranch, tracker?) creating isolated git worktrees at .worktrees/<taskId>/
  - removeWorktree(repoPath, taskId, tracker?) cleaning up worktree dir and branch
  - BranchTracker class with in-memory Map, register/getBranch/getAll/unregister, and JSON persistence
  - 17 passing tests covering GIT-01 (isolation) and GIT-02 (branch tracking)
affects: [01-04, phase-2, phase-3]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "execFile over exec: child_process.execFile used (not exec) to prevent shell injection in git commands"
    - "Optional tracker parameter: createWorktree/removeWorktree accept tracker? param enabling isolated unit testing of git ops"
    - "Fail-fast branch conflict: createWorktree errors on duplicate branch name — caller must removeWorktree first (no silent --force)"
    - "Void-fire persistence: tracker.save() called with void prefix on mutations; async persistence does not block register/unregister"

key-files:
  created:
    - src/git/tracker.ts
    - src/git/worktree.ts
    - src/git/tracker.test.ts
    - src/git/worktree.test.ts
  modified: []

key-decisions:
  - "Branch conflict: fail-fast (error on duplicate branch) rather than --force reuse — safer, prevents silent state corruption"
  - "execFile over exec for git commands — eliminates shell injection surface"
  - "Optional BranchTracker parameter on createWorktree/removeWorktree — enables isolated git-op unit tests without tracker coupling"
  - "Void-fire save() on mutations — persistence is best-effort, does not block synchronous register/unregister API"

patterns-established:
  - "git isolation: worktrees live at .worktrees/<taskId>/ inside the repo root; branch name is agent-harness/task-<taskId>"
  - "TDD integration tests: use os.tmpdir() + crypto.randomUUID() per test, git init + first commit in beforeEach, fs.rm in afterEach"

requirements-completed: [GIT-01, GIT-02]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Phase 1 Plan 03: Git Worktree Isolation and Branch Tracker Summary

**Git worktree isolation (GIT-01) and branch tracking (GIT-02) implemented with TDD: createWorktree/removeWorktree using execFile, BranchTracker with JSON persistence, 17 tests all green**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-04T12:28:14Z
- **Completed:** 2026-03-04T12:30:02Z
- **Tasks:** 1 (TDD — 2 commits: test then feat)
- **Files modified:** 4 created

## Accomplishments
- `createWorktree` creates filesystem-isolated worktrees at `.worktrees/<taskId>/` on branch `agent-harness/task-<taskId>`
- `removeWorktree` cleans up both the directory (`git worktree remove --force`) and the branch (`git branch -d`)
- `BranchTracker` tracks task→branch mappings with in-memory Map and optional JSON persistence with `load()`/`save()`
- Filesystem isolation verified: writing a file in worktree A does not appear in worktree B
- Persistence verified: new BranchTracker instance recovers state from file after simulated restart

## Task Commits

Each task was committed atomically:

1. **RED — Write failing tests** - `d10eea3` (test)
2. **GREEN — Implement tracker and worktree** - `404f7a2` (feat)

_TDD plan: 2 commits (test → feat); no REFACTOR pass required — code was clean on first pass_

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/git/tracker.ts` - BranchTracker class: Map-backed in-memory store, optional JSON state file, register/getBranch/getAll/unregister, async load()/save()
- `src/git/worktree.ts` - createWorktree/removeWorktree using execFile with promisify; optional BranchTracker wiring; git stderr wrapped in thrown Error
- `src/git/tracker.test.ts` - 8 unit tests for BranchTracker (in-memory and persistence scenarios)
- `src/git/worktree.test.ts` - 9 integration tests using real temp git repos (isolation, branch naming, tracker wiring, removeWorktree cleanup)

## Decisions Made

**Branch conflict behavior:** Fail-fast — if `agent-harness/task-<taskId>` already exists, `createWorktree` errors. Callers must `removeWorktree` before recreating. This was chosen over `--force` to prevent silent state corruption from stale branches.

**execFile over exec:** All git commands use `child_process.execFile` (not `exec`), eliminating shell injection surface. Arguments passed as array, not string.

**Optional tracker parameter:** `createWorktree(repoPath, taskId, baseBranch, tracker?)` — tracker is optional so worktree git operations can be tested in isolation without a BranchTracker dependency.

**Void-fire save():** `register()` and `unregister()` call `void this.save()`. Persistence is asynchronous best-effort; mutations are synchronous and never blocked by disk I/O.

## Test Results

```
Test Files  2 passed (2)
Tests       17 passed (17)
```

- `tracker.test.ts`: 8 tests — in-memory CRUD, persistence round-trip, safe load on missing file
- `worktree.test.ts`: 9 tests — path correctness, branch naming convention, filesystem isolation, tracker integration, removeWorktree cleanup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing `tsc --noEmit` error in `src/template/renderer.ts` (Handlebars default import, unrelated to this plan). The git files (`tracker.ts`, `worktree.ts`) type-check cleanly. The renderer.ts issue is deferred and out of scope for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `createWorktree` and `removeWorktree` are ready for use by the container subsystem (01-04) and Phase 3 concurrent execution
- `BranchTracker` can be instantiated with a persistent state file for production use
- Phase 3 concurrent task runner can immediately use this module for per-task isolation
- No blockers for subsequent plans

---
*Phase: 01-foundation*
*Completed: 2026-03-04*
