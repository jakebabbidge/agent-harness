---
phase: 6
slug: wire-state-persistence-cli-dry-run
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x |
| **Config file** | Implicit (vitest detects via package.json) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | WKFL-05 | unit | `npx vitest run src/workflow/runner.test.ts -x` | Yes | pending |
| 06-01-02 | 01 | 1 | WKFL-05 | unit | `npx vitest run src/workflow/runner.test.ts -x` | Yes | pending |
| 06-01-03 | 01 | 1 | TMPL-03 | unit | `npx vitest run src/cli/dry-run.test.ts -x` | No - W0 | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `src/cli/dry-run.test.ts` — stubs for TMPL-03 dry-run CLI command
- [ ] Verify existing `runner.test.ts` covers state persistence with stateManager option

*Existing infrastructure covers WKFL-05 via runner.test.ts.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `agent-harness resume <run-id>` resumes from last completed node | WKFL-05 | Requires process kill + restart | 1. Run a multi-node workflow, 2. Kill mid-run, 3. Run resume with same run-id, 4. Verify picks up from last completed node |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
