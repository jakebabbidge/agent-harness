---
phase: 05-wire-container-isolation
plan: 02
subsystem: infra
tags: [docker, container, executor, cli, devcontainer]

# Dependency graph
requires:
  - phase: 05-wire-container-isolation
    provides: ContainerManager with createContainer/waitForExit, ensureImage builder
  - phase: 02-single-task-execution
    provides: TaskExecutor class, CLI run/resume commands
provides:
  - Container-based TaskExecutor (prompt file write, container wait, result read)
  - CLI wiring with ContainerManager creation, reclaimOrphans, and ensureImage
  - RunWorkflowOptions extended with containerManager field
affects: [05-03, executor, cli, integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [prompt-via-file-mount, container-delegated-execution, orphan-reclaim-on-startup]

key-files:
  created: []
  modified:
    - src/executor/executor.ts
    - src/executor/executor.test.ts
    - src/workflow/runner.ts
    - src/cli/run.ts
    - src/cli/resume.ts
    - src/container/manager.ts

key-decisions:
  - "runId.slice(0,12) as container taskId -- fits Docker name constraints"
  - "ContainerManager.docker exposed as readonly for ensureImage access -- avoids duplicate Dockerode instances"
  - "HITL/QuestionStore removed from executor path -- not wired for container model, can be re-added later"
  - "ensureImage called after reclaimOrphans in CLI -- clean slate before image check"

patterns-established:
  - "Prompt delivery via .harness/prompt.txt file mount instead of shell argument"
  - "Container lifecycle fully encapsulated in TaskExecutor.executeTask -- runner unaware of Docker"
  - "CLI startup sequence: createContainerManager -> reclaimOrphans -> ensureImage -> execute"

requirements-completed: [CONT-01, CONT-02]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 5 Plan 2: Executor and CLI Container Wiring Summary

**TaskExecutor rewritten to delegate to ContainerManager with prompt-via-file and RESULT.md read; CLI run/resume wired with reclaimOrphans and ensureImage startup sequence**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T06:27:53Z
- **Completed:** 2026-03-05T06:30:14Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Rewrote TaskExecutor to use ContainerManager instead of SDK query() -- prompt written to .harness/prompt.txt, container created and awaited, RESULT.md read from worktree mount
- Wired ContainerManager into CLI run and resume commands with reclaimOrphans and ensureImage at startup
- Added containerManager field to RunWorkflowOptions for documentation and future extensibility
- Removed all @anthropic-ai/claude-agent-sdk imports from executor (HITL/QuestionStore deferred to container HITL design)
- All 94 tests pass with 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite TaskExecutor for container-based execution** - `823d33c` (feat)
2. **Task 2: Wire ContainerManager into workflow runner** - `c937d19` (feat)
3. **Task 3: Wire ContainerManager into CLI entry points** - `52fcaba` (feat)

## Files Created/Modified
- `src/executor/executor.ts` - Rewritten: ContainerManager delegation instead of SDK query()
- `src/executor/executor.test.ts` - Rewritten: mock ContainerManager instead of SDK
- `src/workflow/runner.ts` - Added ContainerManager import and options field
- `src/cli/run.ts` - ContainerManager creation, reclaimOrphans, ensureImage, new TaskExecutor wiring
- `src/cli/resume.ts` - Same container wiring as run.ts for resume path
- `src/container/manager.ts` - Exposed docker field as readonly for ensureImage access

## Decisions Made
- Used runId.slice(0,12) as container taskId to fit Docker name constraints
- Exposed ContainerManager.docker as readonly instead of creating separate Dockerode instance for ensureImage
- Removed HITL/QuestionStore from executor entirely -- container HITL mechanism is a separate design concern
- ensureImage called after reclaimOrphans to ensure clean slate before image provisioning

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exposed ContainerManager.docker field**
- **Found during:** Task 3 (CLI wiring)
- **Issue:** ensureImage() requires a Dockerode instance but ContainerManager.docker was private
- **Fix:** Changed docker field from private to readonly public with @internal JSDoc
- **Files modified:** src/container/manager.ts
- **Verification:** tsc --noEmit passes, no new errors in manager.ts
- **Committed in:** 52fcaba (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal accessor change needed for integration. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Full execution pipeline is wired: CLI -> ContainerManager -> TaskExecutor -> container
- Integration testing can proceed (plan 05-03 or end-to-end tests)
- HITL for containerized execution is a future design concern

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 05-wire-container-isolation*
*Completed: 2026-03-05*
