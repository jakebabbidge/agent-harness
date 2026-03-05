---
phase: 05-wire-container-isolation
verified: 2026-03-05T16:33:30Z
status: passed
score: 9/9 must-haves verified
---

# Phase 5: Wire Container Isolation Verification Report

**Phase Goal:** ContainerManager is integrated into the execution pipeline so every task executes inside a Docker container with iptables-based network isolation and restricted filesystem access
**Verified:** 2026-03-05T16:33:30Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | agent-harness:latest Docker image exists after ensureImage() completes | VERIFIED | `src/container/image.ts` exports `ensureImage()` that checks via `docker.getImage(IMAGE_NAME).inspect()` and builds from `docker/Dockerfile` on 404; `IMAGE_NAME = 'agent-harness:latest'` |
| 2 | Container created by ContainerManager uses bridge networking with NET_ADMIN and NET_RAW capabilities | VERIFIED | `src/container/manager.ts:64` sets `CapAdd: ['NET_ADMIN', 'NET_RAW']`; no `NetworkMode: 'none'` present; integration test at `manager.test.ts:149-151` asserts both caps |
| 3 | Container mounts worktree at /workspace (rw) and ~/.claude at /home/node/.claude (ro) | VERIFIED | `src/container/manager.ts:65-67` sets `Binds: [worktreePath:/workspace:rw, claudeDir:/home/node/.claude:ro]`; integration test asserts both binds |
| 4 | Container Cmd chains firewall init and Claude CLI execution | VERIFIED | `src/container/manager.ts:53-56` sets `Cmd: ['bash', '-c', 'sudo /usr/local/bin/init-firewall.sh && claude --dangerously-skip-permissions -p "$(cat /workspace/${promptFilePath})"']` |
| 5 | init-firewall.sh sets default-deny iptables policy with whitelisted domains | VERIFIED | `docker/init-firewall.sh:46-47` has `iptables -A OUTPUT -j DROP` and `iptables -P OUTPUT DROP`; whitelists api.anthropic.com, registry.npmjs.org via dig resolution, GitHub via API meta endpoint |
| 6 | TaskExecutor writes prompt to .harness/prompt.txt in worktree and reads RESULT.md after container exits | VERIFIED | `src/executor/executor.ts:33-34` writes prompt; lines 47-53 read RESULT.md with ENOENT handling; 6 unit tests pass covering this flow |
| 7 | Workflow runner creates a container per node and waits for it to exit before reading results | VERIFIED | `src/workflow/runner.ts:235` calls `executor.executeTask(rendered, executionRepo, uuidv4())` which internally calls createContainer + waitForExit; ContainerManager import at line 9 |
| 8 | CLI run and resume commands create ContainerManager, call reclaimOrphans on startup, and pass manager to execution pipeline | VERIFIED | `src/cli/run.ts:19-26` creates manager, reclaims orphans, ensures image, constructs TaskExecutor; `src/cli/resume.ts:34-39` same pattern |
| 9 | Containers are cleaned up on both normal exit (AutoRemove) and crash (reclaimOrphans on next startup) | VERIFIED | `src/container/manager.ts:63` sets `AutoRemove: true`; `reclaimOrphans()` at lines 143-168 force-removes all labeled containers; called at CLI startup in both run.ts and resume.ts |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docker/Dockerfile` | Container image definition based on node:20 with Claude Code CLI, iptables, ipset | VERIFIED | 29 lines; FROM node:20, apt-get installs iptables/ipset/sudo/etc, npm install claude-code, COPY init-firewall.sh, USER node |
| `docker/init-firewall.sh` | iptables firewall setup with default-deny and whitelist | VERIFIED | 50 lines; flushes rules, allows loopback/established/DNS, creates ipset with resolved IPs for anthropic/npm/github, default-deny OUTPUT |
| `src/container/image.ts` | ensureImage() function that builds agent-harness:latest if not present | VERIFIED | 56 lines; exports `ensureImage` and `IMAGE_NAME`; async execFile for docker build |
| `src/container/manager.ts` | Reworked ContainerManager with devcontainer model | VERIFIED | 179 lines; exports `ContainerManager` and `createContainerManager`; 3-arg createContainer, waitForExit, reclaimOrphans |
| `src/executor/executor.ts` | Container-based task execution (prompt file write, container wait, result read) | VERIFIED | 57 lines; exports `TaskExecutor`; uses ContainerManager, no SDK imports |
| `src/workflow/runner.ts` | Container lifecycle per workflow node | VERIFIED | 296 lines; imports ContainerManager type; RunWorkflowOptions includes containerManager field |
| `src/cli/run.ts` | ContainerManager creation and reclaimOrphans at startup | VERIFIED | 122 lines; imports createContainerManager and ensureImage; startup sequence: create -> reclaimOrphans -> ensureImage -> execute |
| `src/cli/resume.ts` | Same container wiring for resume path | VERIFIED | 90 lines; same startup sequence as run.ts |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/container/manager.ts` | `docker/Dockerfile` | IMAGE_NAME constant references agent-harness:latest | WIRED | `IMAGE_NAME` imported from `./image.js` at line 4 |
| `src/container/image.ts` | `docker/Dockerfile` | buildImage uses docker/ as build context | WIRED | `DOCKERFILE_DIR` resolves to `../../../docker` at line 10-13; passed to `docker build -t` at line 44 |
| `docker/Dockerfile` | `docker/init-firewall.sh` | COPY init-firewall.sh into image | WIRED | `COPY init-firewall.sh /usr/local/bin/init-firewall.sh` at Dockerfile line 23 |
| `src/executor/executor.ts` | `src/container/manager.ts` | TaskExecutor calls createContainer + waitForExit | WIRED | `containerManager.createContainer(taskId, worktreePath, ...)` at line 40; `containerManager.waitForExit(taskId)` at line 43 |
| `src/workflow/runner.ts` | `src/executor/executor.ts` | runner calls executor.executeTask | WIRED | `executor.executeTask(rendered.rendered, executionRepo, uuidv4())` at line 235 |
| `src/cli/run.ts` | `src/container/manager.ts` | CLI creates ContainerManager and calls reclaimOrphans | WIRED | `createContainerManager()` at line 19; `containerManager.reclaimOrphans()` at line 21 |
| `src/cli/run.ts` | `src/container/image.ts` | CLI calls ensureImage before creating containers | WIRED | `ensureImage(containerManager.docker)` at line 24 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CONT-01 | 05-01, 05-02 | Each task execution spawns a dedicated Docker container with the target repository mounted | SATISFIED | ContainerManager.createContainer spawns per-task container with worktree mounted at /workspace:rw; TaskExecutor.executeTask creates one container per task; full pipeline wired from CLI through runner to executor |
| CONT-02 | 05-01, 05-02 | Container network and filesystem access is restricted to only permitted resources | SATISFIED | init-firewall.sh sets iptables default-deny OUTPUT with whitelisted domains only (Anthropic API, npm, GitHub); ~/.claude mounted read-only; container runs as unprivileged node user; NET_ADMIN/NET_RAW caps granted only for iptables setup |

No orphaned requirements found -- REQUIREMENTS.md maps CONT-01 and CONT-02 to Phase 5, both are claimed and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No anti-patterns detected |

No TODO/FIXME/PLACEHOLDER markers, no empty implementations, no stub returns found in any phase artifacts.

### Human Verification Required

### 1. Docker Image Build and Container Execution

**Test:** Run `docker build -t agent-harness:latest docker/` then `agent-harness run <template> <repo>` against a real repository
**Expected:** Container starts, firewall initializes (init-firewall.sh output visible), Claude CLI executes prompt, RESULT.md written to worktree
**Why human:** Requires Docker daemon, network connectivity, and Anthropic API key -- cannot verify container runtime behavior programmatically in CI

### 2. Firewall Isolation Verification

**Test:** Inside a running container, attempt `curl https://example.com` (should fail) and `curl https://api.anthropic.com` (should succeed)
**Expected:** Non-whitelisted domains are blocked; whitelisted domains resolve and connect
**Why human:** Requires running container with active iptables rules; DNS resolution and ipset population are runtime behaviors

### 3. Orphan Container Cleanup

**Test:** Start `agent-harness run`, kill the process mid-execution (Ctrl+C or kill), then run `agent-harness run` again
**Expected:** Second run logs "Reclaiming orphaned containers..." and removes the leftover container before proceeding
**Why human:** Requires simulating a crash scenario with Docker daemon interaction

## Compilation and Test Results

- TypeScript: compiles clean (`npx tsc --noEmit` -- 0 errors)
- Unit tests: 94 passed, 4 skipped (Docker integration tests require daemon)
- All 6 commits verified in git history (2ef2d6f through 52fcaba)

---

_Verified: 2026-03-05T16:33:30Z_
_Verifier: Claude (gsd-verifier)_
