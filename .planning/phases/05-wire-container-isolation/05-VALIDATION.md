---
phase: 5
slug: wire-container-isolation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run src/container/ src/executor/ -x` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/container/ src/executor/ -x`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 0 | CONT-01 | unit | `npx vitest run src/container/manager.test.ts -x` | Exists (needs update) | ⬜ pending |
| 05-01-02 | 01 | 0 | CONT-01 | unit | `npx vitest run src/executor/executor.test.ts -x` | Exists (needs rewrite) | ⬜ pending |
| 05-01-03 | 01 | 0 | CONT-02 | integration | `npx vitest run src/container/manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | CONT-01 | integration | `npx vitest run src/container/manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | CONT-02 | integration | `npx vitest run src/container/manager.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/container/manager.test.ts` — update tests for new createContainer signature (CapAdd, new image, mounts)
- [ ] `src/container/manager.test.ts` — add firewall verification test (wget blocked, API reachable)
- [ ] `src/executor/executor.test.ts` — rewrite for container-based execution (mock dockerode, not SDK)
- [ ] `docker/Dockerfile` — new file, validated by integration tests
- [ ] `docker/init-firewall.sh` — new file, validated by integration tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Firewall blocks non-whitelisted domains | CONT-02 | Requires running Docker with real network | Start container, `wget http://example.com` should fail, `wget https://api.anthropic.com` should succeed |
| Container cleanup after host crash | CONT-01 | Requires simulating crash | Kill host process, verify reclaimOrphans() cleans up on next startup |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
