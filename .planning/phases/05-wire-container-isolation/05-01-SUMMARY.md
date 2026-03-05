---
phase: 05-wire-container-isolation
plan: 01
subsystem: infra
tags: [docker, iptables, ipset, container-isolation, devcontainer]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: ContainerManager skeleton, ContainerRegistry, Dockerode constructor injection
provides:
  - Dockerfile for agent-harness:latest image (node:20 + Claude Code CLI + firewall tools)
  - init-firewall.sh with default-deny iptables and domain whitelist
  - ensureImage() builder for automatic image provisioning
  - Reworked ContainerManager with devcontainer execution model
  - waitForExit() method for blocking on container process completion
affects: [05-02, 05-03, executor, cli]

# Tech tracking
tech-stack:
  added: [iptables, ipset, init-firewall.sh]
  patterns: [devcontainer-model, firewall-based-isolation, cli-exec-in-container]

key-files:
  created:
    - docker/Dockerfile
    - docker/init-firewall.sh
    - src/container/image.ts
  modified:
    - src/container/manager.ts
    - src/container/manager.test.ts

key-decisions:
  - "docker CLI build over dockerode.buildImage() -- simpler COPY/context handling"
  - "Bridge networking with iptables firewall replaces NetworkMode:none -- allows whitelisted outbound"
  - "Container Cmd chains sudo init-firewall.sh then Claude CLI -- single process lifecycle"
  - "async execFile for image build -- non-blocking while still simple"

patterns-established:
  - "Devcontainer model: container runs agent as main process, host waits for exit"
  - "IMAGE_NAME constant shared between image.ts and manager.ts via import"
  - "3-arg createContainer(taskId, worktreePath, promptFilePath) API"

requirements-completed: [CONT-01, CONT-02]

# Metrics
duration: 3min
completed: 2026-03-05
---

# Phase 5 Plan 1: Container Image and Manager Rework Summary

**Dockerfile with node:20 + Claude Code CLI + iptables firewall, ensureImage() builder, and devcontainer-model ContainerManager with waitForExit()**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-05T06:23:03Z
- **Completed:** 2026-03-05T06:25:34Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Created Dockerfile based on node:20 with Claude Code CLI, iptables, ipset, sudo for node user
- Created init-firewall.sh with default-deny iptables policy and whitelisted domains (Anthropic API, npm, GitHub)
- Built ensureImage() that auto-builds agent-harness:latest on first run
- Reworked ContainerManager from NetworkMode:none model to devcontainer model with bridge networking, NET_ADMIN/NET_RAW caps, ~/.claude mount, and Claude CLI as container Cmd
- Added waitForExit() method for host to block until container process completes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Dockerfile and init-firewall.sh** - `2ef2d6f` (feat)
2. **Task 2: Create image builder module** - `884b78a` (feat)
3. **Task 3: Rework ContainerManager for devcontainer model** - `d73b766` (feat)

## Files Created/Modified
- `docker/Dockerfile` - Container image definition: node:20, Claude Code CLI, iptables, ipset, sudo
- `docker/init-firewall.sh` - iptables firewall setup with default-deny and domain whitelist
- `src/container/image.ts` - ensureImage() and IMAGE_NAME exports for image lifecycle
- `src/container/manager.ts` - Reworked ContainerManager with devcontainer model and waitForExit()
- `src/container/manager.test.ts` - Updated tests for 3-arg API, image check, devcontainer assertions

## Decisions Made
- Used docker CLI build instead of dockerode.buildImage() for simpler COPY/build-context handling
- Bridge networking with iptables firewall replaces NetworkMode:none to allow whitelisted outbound traffic
- Container Cmd chains `sudo init-firewall.sh && claude ...` as single bash command for process lifecycle
- async execFile (not execFileSync) for non-blocking image build

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Container infrastructure ready for downstream wiring (executor, CLI integration)
- Image must be built before integration tests run (ensureImage handles this at runtime)
- Plans 05-02 and 05-03 can proceed to wire executor and CLI integration

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 05-wire-container-isolation*
*Completed: 2026-03-05*
