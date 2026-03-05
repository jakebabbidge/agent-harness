---
phase: 2
slug: single-task-execution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run src/executor/ src/hitl/ src/workflow/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/executor/ src/hitl/ src/workflow/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | EXEC-01, EXEC-02, EXEC-04 | unit | `npx vitest run src/executor/executor.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 0 | EXEC-03 | unit | `npx vitest run src/hitl/question-store.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 0 | WKFL-01 | unit | `npx vitest run src/workflow/parser.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 0 | WKFL-02 | unit | `npx vitest run src/workflow/runner.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/executor/executor.test.ts` — stubs for EXEC-01, EXEC-02, EXEC-04
- [ ] `src/hitl/question-store.test.ts` — stubs for EXEC-03
- [ ] `src/workflow/parser.test.ts` — stubs for WKFL-01
- [ ] `src/workflow/runner.test.ts` — stubs for WKFL-02
- [ ] `npm install @anthropic-ai/claude-agent-sdk yaml uuid @types/uuid`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| EXEC-01 end-to-end with real API | EXEC-01 | Requires ANTHROPIC_API_KEY and live API call | Run `agent-harness run <template> <repo>` with valid API key, verify agent executes and produces result |
| EXEC-02/03 full HITL flow | EXEC-02, EXEC-03 | Requires two terminal sessions (run + answer) | Start run, wait for question prompt, run answer command in second terminal, verify agent resumes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
