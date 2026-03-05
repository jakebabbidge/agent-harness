---
phase: 07-restore-hitl-for-container-model
plan: 01
subsystem: executor
tags: [agent-sdk, hitl, docker, file-ipc, canUseTool]

# Dependency graph
requires:
  - phase: 05-container-isolation
    provides: ContainerManager with Docker lifecycle, Dockerfile, init-firewall.sh
  - phase: 02-single-task-execution
    provides: canUseTool HITL pattern, QuestionStore file-based IPC, TaskExecutor
provides:
  - agent-runner.js container-side SDK script with canUseTool HITL interception
  - ContainerManager Cmd using agent-runner.js with ANTHROPIC_API_KEY and HARNESS_IPC_DIR env vars
  - Dockerfile with @anthropic-ai/claude-agent-sdk install and agent-runner.js baked in
  - TaskExecutor host-side question polling concurrent with waitForExit
affects: [07-02, answer-command, workflow-engine-hitl]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/claude-agent-sdk (in Docker image)"]
  patterns: [file-based IPC via question.json/answer.json across Docker bind mount, concurrent polling with waitForExit]

key-files:
  created:
    - docker/agent-runner.js
    - src/container/manager.unit.test.ts
  modified:
    - docker/Dockerfile
    - src/container/manager.ts
    - src/executor/executor.ts
    - src/executor/executor.test.ts
    - src/container/manager.test.ts

key-decisions:
  - "agent-runner.js uses deny+message for AskUserQuestion interception -- delivers answer text as denial message per Phase 2 pattern"
  - "HARNESS_IPC_DIR env var controls IPC path -- enables nodeId-scoped subdirectories for future multi-node concurrent HITL"
  - "Host-side polling uses 500ms interval with containerDone flag -- same proven interval from Phase 2"
  - "Stale IPC file cleanup added before container creation -- prevents stale question pickup from previous runs"

patterns-established:
  - "Container env var injection: ANTHROPIC_API_KEY and HARNESS_IPC_DIR passed via Env array in createContainer"
  - "Concurrent polling: question poller runs alongside waitForExit with shared containerDone flag"
  - "Post-exit question check: final question.json read after container exits guards against race condition"

requirements-completed: [EXEC-02]

# Metrics
duration: 3min
completed: 2026-03-05
---

# Phase 7 Plan 01: Agent-Runner and Host-Side Question Polling Summary

**Container-side agent-runner.js with SDK canUseTool HITL interception and host-side question polling in TaskExecutor**

## Performance

- **Duration:** 3 min 27s
- **Started:** 2026-03-05T07:53:38Z
- **Completed:** 2026-03-05T07:57:05Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created docker/agent-runner.js: standalone ESM Node.js script using SDK query() with canUseTool callback to intercept AskUserQuestion, write question.json, poll answer.json, and resume agent
- Updated Dockerfile to install @anthropic-ai/claude-agent-sdk globally and COPY agent-runner.js into image
- Changed ContainerManager Cmd from direct claude CLI to node agent-runner.js with ANTHROPIC_API_KEY and HARNESS_IPC_DIR env vars
- Added concurrent question polling to TaskExecutor that surfaces agent questions at CLI with answer command hint
- Added stale IPC file cleanup and post-exit question check (race condition guard)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create agent-runner.js and update Dockerfile and ContainerManager Cmd** - `61079ae` (feat)
2. **Task 2: Add host-side question polling to TaskExecutor** - `d4cddcd` (feat)

## Files Created/Modified
- `docker/agent-runner.js` - Container-side SDK agent with canUseTool HITL interception, writes question.json, polls answer.json
- `docker/Dockerfile` - Installs @anthropic-ai/claude-agent-sdk, copies agent-runner.js into image
- `src/container/manager.ts` - Cmd changed to agent-runner.js, env vars added, promptFilePath parameter removed
- `src/container/manager.unit.test.ts` - Unit tests for Cmd, env vars, and signature changes
- `src/container/manager.test.ts` - Updated integration tests for new createContainer signature
- `src/executor/executor.ts` - Concurrent question polling with waitForExit, stale cleanup, post-exit check
- `src/executor/executor.test.ts` - Tests for stale cleanup, question surfacing, concurrent polling

## Decisions Made
- Used `deny` with message for AskUserQuestion interception (matches Phase 2 pattern -- delivers answer text as denial message to agent)
- HARNESS_IPC_DIR env var pattern allows future nodeId-scoped subdirectories for multi-node concurrent HITL
- Removed promptFilePath from createContainer signature -- agent-runner reads directly from .harness/prompt.txt via HARNESS_IPC_DIR
- ANTHROPIC_API_KEY passed explicitly as env var (may be redundant with .claude mount, but ensures SDK auth works)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Agent-runner and host-side polling complete -- ready for Plan 02 (answer CLI command adaptation)
- The answer command needs to write answer.json to the correct worktree .harness/ path
- Docker image needs rebuilding (`docker build`) to include agent-runner.js and SDK

---
*Phase: 07-restore-hitl-for-container-model*
*Completed: 2026-03-05*
