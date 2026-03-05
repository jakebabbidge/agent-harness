---
phase: 3
slug: concurrent-workflow-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x |
| **Config file** | none — vitest uses default config via package.json `scripts.test` |
| **Quick run command** | `npx vitest run src/workflow/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/workflow/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | WKFL-03 | unit | `npx vitest run src/workflow/dag.test.ts` | No — W0 | pending |
| 3-01-02 | 01 | 0 | WKFL-04 | unit | `npx vitest run src/workflow/condition.test.ts` | No — W0 | pending |
| 3-01-03 | 01 | 0 | WKFL-05 | unit | `npx vitest run src/workflow/state.test.ts` | No — W0 | pending |
| 3-01-04 | 01 | 0 | WKFL-03 | unit | `npx vitest run src/workflow/runner.test.ts -t "concurrent"` | No — W0 | pending |
| 3-02-01 | 02 | 1 | WKFL-03 | unit | `npx vitest run src/workflow/runner.test.ts -t "concurrent"` | No — W0 | pending |
| 3-02-02 | 02 | 1 | WKFL-03 | unit | `npx vitest run src/workflow/runner.test.ts -t "worktree"` | No — W0 | pending |
| 3-03-01 | 03 | 1 | WKFL-04 | unit | `npx vitest run src/workflow/condition.test.ts` | No — W0 | pending |
| 3-03-02 | 03 | 1 | WKFL-04 | unit | `npx vitest run src/workflow/condition.test.ts -t "unconditional"` | No — W0 | pending |
| 3-04-01 | 04 | 2 | WKFL-05 | unit | `npx vitest run src/workflow/state.test.ts` | No — W0 | pending |
| 3-04-02 | 04 | 2 | WKFL-05 | unit | `npx vitest run src/workflow/runner.test.ts -t "resume"` | No — W0 | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `src/workflow/dag.test.ts` — stubs for topological sort and cycle detection
- [ ] `src/workflow/condition.test.ts` — stubs for edge condition evaluation
- [ ] `src/workflow/state.test.ts` — stubs for state persistence and loading
- [ ] Updated `src/workflow/runner.test.ts` — stubs for concurrent execution and resume

*Wave 0 creates test file stubs that plans will fill during execution.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Process kill + resume | WKFL-05 | Requires external process signal | 1. Start a multi-node workflow 2. Kill process mid-run 3. Run `agent-harness resume <run-id>` 4. Verify completed nodes are skipped |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
