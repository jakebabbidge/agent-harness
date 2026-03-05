---
phase: 7
slug: restore-hitl-for-container-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | EXEC-02 | unit | `npx vitest run src/executor/executor.test.ts -t "question polling" -x` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | EXEC-02 | unit | `npx vitest run src/hitl/agent-runner.test.ts -x` | ❌ W0 | ⬜ pending |
| 7-01-03 | 01 | 1 | EXEC-03 | unit | `npx vitest run src/cli/answer.test.ts -x` | ❌ W0 | ⬜ pending |
| 7-01-04 | 01 | 1 | EXEC-03 | unit | `npx vitest run src/hitl/agent-runner.test.ts -t "resumes" -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/executor/executor.test.ts` — add tests for concurrent question polling behavior
- [ ] `src/cli/answer.test.ts` — new file covering worktree-path answer resolution
- [ ] `src/hitl/agent-runner.test.ts` — new file for canUseTool interception logic (unit testable without Docker)

*Existing infrastructure covers test framework (vitest already configured).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end HITL through Docker container boundary | EXEC-02, EXEC-03 | Requires running Docker container with live agent | 1. Run `agent-harness run` with a task that triggers a question. 2. Verify question surfaces at CLI. 3. Run `agent-harness answer <run-id> "<answer>"`. 4. Verify agent resumes. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
