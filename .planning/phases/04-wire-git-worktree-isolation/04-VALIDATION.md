---
phase: 4
slug: wire-git-worktree-isolation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x |
| **Config file** | Inline in package.json (`"test": "vitest run"`) |
| **Quick run command** | `npx vitest run src/git/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/git/ src/workflow/runner.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 0 | GIT-01 | integration | `npx vitest run src/workflow/runner.test.ts -t "worktree"` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 0 | GIT-01 | integration | `npx vitest run src/workflow/runner.test.ts -t "cleanup"` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 0 | GIT-02 | integration | `npx vitest run src/workflow/runner.test.ts -t "tracker"` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | GIT-01 | unit | `npx vitest run src/git/tracker.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/workflow/runner.test.ts` — new test cases for worktree integration (GIT-01)
- [ ] `src/workflow/runner.test.ts` — new test cases for worktree cleanup on failure (GIT-01)
- [ ] `src/workflow/runner.test.ts` — new test cases for BranchTracker population (GIT-02)
- [ ] Integration test verifying two concurrent nodes get separate worktree paths

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two concurrent tasks get separate worktrees and do not share filesystem state | GIT-01 | Concurrency timing is hard to unit test reliably | Run two tasks in parallel via CLI and verify separate `.worktrees/` directories exist |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
