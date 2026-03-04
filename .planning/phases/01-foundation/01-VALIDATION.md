---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (^2.x) |
| **Config file** | vitest.config.ts — Wave 0 creation required |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/template/` (fast unit tests only, < 5s)
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-xx-01 | TBD | 0 | TMPL-01 | unit | `npx vitest run src/template/renderer.test.ts` | ❌ W0 | ⬜ pending |
| 1-xx-02 | TBD | 0 | TMPL-02 | unit | `npx vitest run src/template/renderer.test.ts` | ❌ W0 | ⬜ pending |
| 1-xx-03 | TBD | 0 | TMPL-03 | unit | `npx vitest run src/template/renderer.test.ts` | ❌ W0 | ⬜ pending |
| 1-xx-04 | TBD | 0 | CONT-01 | integration | `npx vitest run src/container/manager.test.ts` | ❌ W0 | ⬜ pending |
| 1-xx-05 | TBD | 0 | CONT-02 | integration | `npx vitest run src/container/manager.test.ts` | ❌ W0 | ⬜ pending |
| 1-xx-06 | TBD | 0 | GIT-01 | integration | `npx vitest run src/git/worktree.test.ts` | ❌ W0 | ⬜ pending |
| 1-xx-07 | TBD | 0 | GIT-02 | unit | `npx vitest run src/git/tracker.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — configure test environment (node), coverage
- [ ] `src/template/renderer.test.ts` — stubs for TMPL-01, TMPL-02, TMPL-03
- [ ] `src/container/manager.test.ts` — stubs for CONT-01, CONT-02 (requires Docker socket; mark as integration)
- [ ] `src/git/worktree.test.ts` — stubs for GIT-01 (requires temp git repo fixture)
- [ ] `src/git/tracker.test.ts` — stubs for GIT-02
- [ ] `package.json` — install vitest, add test script
- [ ] `tsconfig.json` — initialize with NodeNext ESM settings

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Container cleaned up on SIGKILL | CONT-01 | SIGKILL cannot be issued reliably in automated test environment | Run harness, `kill -9` the process, verify no containers remain with `docker ps -a` |
| Network isolation prevents outbound calls | CONT-02 | Requires live network environment | Exec a `curl` command inside the container, verify it fails |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
