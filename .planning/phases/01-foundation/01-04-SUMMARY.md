---
phase: 01-foundation
plan: 04
subsystem: infra
tags: [docker, dockerode, containers, isolation, sigkill, network-isolation]

# Dependency graph
requires:
  - phase: 01-01
    provides: "TypeScript ESM project structure, ContainerInfo and TaskId types in src/types/index.ts"
provides:
  - "ContainerManager class — create, start, stop, reclaimOrphans lifecycle operations"
  - "ContainerRegistry — in-memory Map<TaskId, ContainerInfo> with register/get/unregister/getAll"
  - "Docker isolation flags verified: NetworkMode=none, ReadonlyRootfs=true, AutoRemove=true, Tmpfs on /tmp and /home"
  - "SIGKILL-safe cleanup confirmed via AutoRemove=true — Docker daemon removes container without harness intervention"
affects: [phase-2-execution, task-runner, agent-spawner]

# Tech tracking
tech-stack:
  added: [dockerode]
  patterns: [constructor-injection for Dockerode instance, AutoRemove for SIGKILL-safe teardown, label-based orphan discovery]

key-files:
  created:
    - src/container/manager.ts
    - src/container/registry.ts
    - src/container/manager.test.ts
  modified: []

key-decisions:
  - "AutoRemove=true means harness must NOT call container.remove() after stop() — it will 404; Docker daemon owns cleanup"
  - "ContainerManager takes Dockerode instance in constructor — enables injection of real or mock docker in tests"
  - "createContainerManager() factory function as default export with optional socketPath param"
  - "reclaimOrphans uses label filter agent-harness=true with force remove — clears all orphans regardless of state"
  - "NetworkMode=none confirmed to block all outbound traffic including DNS resolution (wget: bad address 'example.com')"

patterns-established:
  - "Pattern: Constructor injection for external I/O clients (Dockerode) — keeps classes testable without mocking globals"
  - "Pattern: Label-based resource ownership — all harness containers carry agent-harness=true for orphan discovery"
  - "Pattern: Tmpfs scratch mounts (/tmp, /home) paired with ReadonlyRootfs for safe writable scratch space in isolated containers"

requirements-completed: [CONT-01, CONT-02]

# Metrics
duration: ~25min
completed: 2026-03-04
---

# Phase 1 Plan 04: Container Lifecycle Manager Summary

**Dockerode-based ContainerManager with SIGKILL-safe AutoRemove, NetworkMode=none isolation, and orphan recovery — all 8 integration tests passing against live Docker socket**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-04T22:40:00Z
- **Completed:** 2026-03-04T22:47:57Z
- **Tasks:** 2 (1 auto TDD, 1 human-verify checkpoint)
- **Files modified:** 3

## Accomplishments

- ContainerManager implements full container lifecycle: create, start, stop, reclaimOrphans
- ContainerRegistry provides in-memory Map<TaskId, ContainerInfo> with type-safe get/register/unregister/getAll
- All isolation flags verified via automated inspect tests: NetworkMode=none, ReadonlyRootfs=true, AutoRemove=true, Tmpfs on /tmp and /home
- SIGKILL-safe cleanup confirmed manually: container created with AutoRemove=true disappears within ~10 seconds after kill -9 of the host process
- Network isolation confirmed manually: `wget: bad address 'example.com'` — DNS resolution blocked, no outbound traffic possible

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): add container manager tests** - `33d3b16` (test)
2. **Task 1 (GREEN): implement container manager and registry** - `1c4fa63` (feat)

**Plan metadata:** (docs commit — see final_commit below)

_Note: TDD task has two commits (test RED → feat GREEN). Task 2 was a human-verify checkpoint, no code changes._

## Test Results

**Docker available:** Yes (live Docker socket at /var/run/docker.sock)

All 8 tests passed:

| Test | Suite | Result | Duration |
|------|-------|--------|----------|
| registers and retrieves a ContainerInfo by taskId | ContainerRegistry | PASS | <1ms |
| returns undefined for unknown taskId | ContainerRegistry | PASS | <1ms |
| unregisters a taskId | ContainerRegistry | PASS | <1ms |
| getAll returns all registered entries | ContainerRegistry | PASS | <1ms |
| createContainer returns ContainerInfo with correct taskId and containerName pattern | ContainerManager integration | PASS | 5205ms |
| inspect after createContainer shows correct isolation HostConfig flags | ContainerManager integration | PASS | 5173ms |
| stopContainer removes the container from registry and it no longer exists in Docker | ContainerManager integration | PASS | 7172ms |
| reclaimOrphans removes labeled orphan containers created outside the manager | ContainerManager integration | PASS | 1176ms |

**Total:** 8/8 passed — 19.04s total run time

## Manual Checkpoint Verification Results

**Test 1 — SIGKILL cleanup (PASSED):**
Container started with AutoRemove=true. After `kill -9` of the host process, container died and was cleaned up within approximately 10 seconds. `docker ps -a --filter name=agent-harness-sigkill-test` returned no results. AutoRemove=true works as expected — Docker daemon owns cleanup, harness does not need to call `container.remove()`.

**Test 2 — Network isolation (PASSED):**
Container started with NetworkMode=none. `docker exec test-isolation sh -c 'wget -q https://example.com -O - 2>&1 || echo NETWORK_BLOCKED'` produced `wget: bad address 'example.com'` followed by `NETWORK_BLOCKED`. DNS resolution is blocked; no outbound HTTP possible. Network isolation confirmed.

## Files Created/Modified

- `src/container/registry.ts` — In-memory Map<TaskId, ContainerInfo> registry with register/get/unregister/getAll
- `src/container/manager.ts` — ContainerManager class with createContainer, stopContainer, reclaimOrphans; createContainerManager factory export
- `src/container/manager.test.ts` — 8 integration tests (4 registry unit, 4 Docker integration); skip guard via existsSync('/var/run/docker.sock')

## Decisions Made

- AutoRemove=true chosen for SIGKILL safety — Docker daemon removes the container automatically; calling `container.remove()` after `stop()` would 404 and is explicitly skipped
- Constructor injection for Dockerode instance — enables test isolation without global mocking; `createContainerManager(socketPath?)` factory wraps the default construction
- NetworkMode=none blocks DNS and all outbound traffic — confirmed more aggressive than expected (wget cannot even resolve hostnames, not just blocked TCP)
- Label `agent-harness=true` on all containers enables `reclaimOrphans` to find and force-remove orphans regardless of container state
- `node:20-alpine` used as default image — lightweight, already present on test machine

## Deviations from Plan

None - plan executed exactly as written. TDD RED/GREEN cycle followed. Manual verification checkpoint completed with both tests passing.

## Issues Encountered

None — Docker was available, `node:20-alpine` was already pulled, all tests passed on first run after implementation.

## User Setup Required

None - no external service configuration required. Docker must be installed and running on the host, but this is a prerequisite documented in project setup.

## Next Phase Readiness

- ContainerManager and ContainerRegistry are complete and ready for Phase 2 task execution
- Network isolation (NetworkMode=none) and filesystem isolation (ReadonlyRootfs=true + Tmpfs) are confirmed working
- SIGKILL-safe cleanup via AutoRemove=true is confirmed — no harness-side cleanup code needed
- Phase 2 agent-spawning can import `createContainerManager` from `src/container/manager.js` and `ContainerRegistry` from `src/container/registry.js`
- Concern still open: Claude Code invocation model inside a container (LOW-MEDIUM confidence) — needs verification before Phase 2 IPC architecture is committed

---
*Phase: 01-foundation*
*Completed: 2026-03-04*

## Self-Check: PASSED

- FOUND: src/container/manager.ts
- FOUND: src/container/registry.ts
- FOUND: src/container/manager.test.ts
- FOUND: .planning/phases/01-foundation/01-04-SUMMARY.md
- FOUND commit: 33d3b16 (test RED)
- FOUND commit: 1c4fa63 (feat GREEN)
- All 8 tests passing, `tsc --noEmit` exits 0
