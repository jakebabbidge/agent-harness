---
phase: 02-single-task-execution
verified: 2026-03-05T13:00:00Z
status: human_needed
score: 9/9 must-haves verified
re_verification: false
human_verification:
  - test: "Template execution produces RESULT.md"
    expected: "agent-harness run <template.hbs> --repo <path> causes agent to write RESULT.md, exits 0"
    why_human: "Requires live ANTHROPIC_API_KEY and real SDK invocation; cannot mock in automated check"
  - test: "HITL question surfaces and answer resumes agent"
    expected: "Agent pauses showing '[agent-harness] Agent asking question for run <id>', then 'agent-harness answer <id> text' causes agent to resume and complete"
    why_human: "Cross-process real-time IPC flow; two terminals required; cannot automate without live SDK"
  - test: "API key guard enforcement"
    expected: "Running agent-harness run without ANTHROPIC_API_KEY set prints a clear error and exits 1"
    why_human: "API key guard is currently commented out (lines 13-16 of src/cli/run.ts); needs human to confirm whether this is intentional for development or a gap to address"
---

# Phase 2: Single-Task Execution Verification Report

**Phase Goal:** Build the single-task execution pipeline: template rendering -> Claude agent invocation -> structured output collection, with HITL support and CLI interface.
**Verified:** 2026-03-05T13:00:00Z
**Status:** HUMAN_NEEDED (all automated checks pass; 3 items require human or live-API verification)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All truths are drawn from `must_haves` across plans 02-01, 02-02, and 02-03.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | QuestionStore writes question.json and polls for answer.json, resolving when answer arrives | VERIFIED | `askAndWait` in question-store.ts lines 17-50; 2 test cases covering this flow — all pass |
| 2 | QuestionStore consumes (deletes) answer.json after reading to prevent stale answers | VERIFIED | `fs.unlink(answerPath)` at line 44 of question-store.ts; verified by test "answer.json is deleted after askAndWait resolves" |
| 3 | YAML workflow file with valid schema parses to typed WorkflowDef | VERIFIED | `parseWorkflow` in parser.ts uses `WorkflowDefSchema.parse()` with zod; 9 parser tests all pass |
| 4 | Invalid YAML or schema mismatch throws a descriptive error | VERIFIED | parser.test.ts covers: empty nodes array, missing version, missing nodes field, invalid YAML syntax, ENOENT — all 4 tests throw as expected |
| 5 | TaskExecutor calls SDK query() with prompt and cwd, returning TaskResult with exitCode and resultText | VERIFIED | executor.ts lines 36-76; test "calls query with correct prompt and cwd" verifies cwd; exit code mapping tested for both success and error subtypes |
| 6 | TaskExecutor wires canUseTool callback to QuestionStore.askAndWait for AskUserQuestion tool | VERIFIED | executor.ts lines 43-50; executor.test.ts "canUseTool delegates AskUserQuestion to QuestionStore.askAndWait" — test passes |
| 7 | TaskExecutor reads RESULT.md from worktree path after query() completes as structured output | VERIFIED | executor.ts lines 67-74; test "reads RESULT.md content as resultText" and "returns empty resultText when RESULT.md does not exist" — both pass |
| 8 | WorkflowRunner executes nodes sequentially in order, stopping on first failure | VERIFIED | runner.ts for-loop lines 32-48; runner.test.ts "first node failure stops execution — second node is NOT called" passes |
| 9 | WorkflowRunner passes each node's template + variables through the template renderer before execution | VERIFIED | runner.ts line 36 calls `renderTemplate(node.template, node.variables ?? {}, [])`; runner.test.ts "executor receives rendered template text, not raw template path" passes |

**Score: 9/9 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types/index.ts` | WorkflowDef, NodeDef, EdgeDef, RunState, QuestionRecord types | VERIFIED | All 7 Phase 2 types present: QuestionRecord, AnswerRecord, NodeDef, EdgeDef, WorkflowDef, TaskResult, RunState (lines 48-106) |
| `src/hitl/question-store.ts` | QuestionStore class with askAndWait method | VERIFIED | Full class with askAndWait, submitAnswer, getQuestion, purgeRunDir — 91 lines, substantive |
| `src/hitl/question-store.test.ts` | Unit tests for file-based IPC question/answer flow | VERIFIED | 143 lines, 8 tests covering all methods including stale answer deletion and directory creation |
| `src/workflow/parser.ts` | parseWorkflow function with zod validation | VERIFIED | 29 lines, exports parseWorkflow, WorkflowDefSchema, NodeDefSchema, EdgeDefSchema, WorkflowDef type |
| `src/workflow/parser.test.ts` | Unit tests for YAML parsing and schema validation | VERIFIED | 133 lines, 9 tests covering valid/invalid cases |
| `src/executor/executor.ts` | TaskExecutor class wrapping Claude Agent SDK query() | VERIFIED | 79 lines, TaskExecutor class exported, full implementation with HITL callback and RESULT.md reading |
| `src/executor/executor.test.ts` | Unit tests with mocked SDK for executor behavior | VERIFIED | 177 lines, 8 tests with vi.mock() for SDK, covers all behavior branches |
| `src/workflow/runner.ts` | WorkflowRunner with sequential node execution | VERIFIED | 51 lines, exports runWorkflow and WorkflowResult, sequential for-loop with stop-on-failure |
| `src/workflow/runner.test.ts` | Unit tests with mocked executor for sequential workflow | VERIFIED | 141 lines, 7 tests covering single-node, multi-node, failure propagation, UUID uniqueness |
| `src/cli/index.ts` | Commander CLI entry point with run and answer subcommands | VERIFIED | 31 lines, Commander program with both subcommands wired; help output verified via CLI invocation |
| `src/cli/run.ts` | run command — detects template vs workflow, orchestrates execution | VERIFIED | 90 lines, .yaml/.yml detection, template mode requires --repo, workflow mode calls runWorkflow |
| `src/cli/answer.ts` | answer command — submits answer via QuestionStore | VERIFIED | 26 lines, getQuestion check + submitAnswer wiring, clear error on missing question |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/hitl/question-store.ts | src/types/index.ts | import QuestionRecord type | VERIFIED | Line 4: `import type { QuestionRecord, AnswerRecord } from '../types/index.js'` |
| src/workflow/parser.ts | src/types/index.ts | re-exports WorkflowDef type derived from zod schema | VERIFIED | Line 23: `export type WorkflowDef = z.infer<typeof WorkflowDefSchema>` — WorkflowDef present in both files |
| src/executor/executor.ts | @anthropic-ai/claude-agent-sdk | import query from SDK | VERIFIED | Line 3: `import { query } from '@anthropic-ai/claude-agent-sdk'`; called at line 36 |
| src/executor/executor.ts | src/hitl/question-store.ts | canUseTool callback delegates to QuestionStore | VERIFIED | Line 4: QuestionStore imported; line 45: `this.questionStore.askAndWait(runId, input)` in canUseTool |
| src/workflow/runner.ts | src/executor/executor.ts | calls executor.run for each node | VERIFIED | Line 3: TaskExecutor imported; line 39: `executor.executeTask(rendered.rendered, node.repo, runId)` |
| src/workflow/runner.ts | src/workflow/parser.ts | receives parsed WorkflowDef | VERIFIED | Line 4: `import type { WorkflowDef ... } from '../types/index.js'`; WorkflowDef is the accepted parameter type |
| src/cli/run.ts | src/executor/executor.ts | creates TaskExecutor and calls executeTask | VERIFIED | Line 2: TaskExecutor imported; line 19: `new TaskExecutor(questionStore)`; line 65: `executor.executeTask(...)` |
| src/cli/run.ts | src/workflow/parser.ts | parseWorkflow for .yaml files | VERIFIED | Line 4: parseWorkflow imported; line 26: called in workflow branch |
| src/cli/run.ts | src/workflow/runner.ts | runWorkflow for workflow execution | VERIFIED | Line 5: runWorkflow imported; line 27: called with workflow and executor |
| src/cli/answer.ts | src/hitl/question-store.ts | QuestionStore.submitAnswer | VERIFIED | Line 1: QuestionStore imported; line 4: instantiated; line 19: `questionStore.submitAnswer(runId, answers)` |

**All 10 key links: WIRED**

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| EXEC-01 | 02-02, 02-03 | User can run a prompt template against a repository with `agent-harness run <template> <repo>` | VERIFIED (automated) / ? (human E2E) | CLI run command in run.ts handles template mode with --repo flag; wired to TaskExecutor; human E2E verified per SUMMARY |
| EXEC-02 | 02-01, 02-03 | When the agent asks a question mid-task, execution pauses and the question is surfaced to the CLI operator | VERIFIED (automated) / ? (human E2E) | canUseTool callback in executor.ts delegates AskUserQuestion to QuestionStore; console.log surfaces question to operator; human E2E verified per SUMMARY |
| EXEC-03 | 02-01, 02-03 | CLI operator can answer a surfaced question; the agent resumes with the answer | VERIFIED (automated) / ? (human E2E) | answerCommand in answer.ts calls QuestionStore.submitAnswer; askAndWait polling loop picks up answer.json; human E2E verified per SUMMARY |
| EXEC-04 | 02-02, 02-03 | Agent writes structured output to a designated markdown memory bank file; harness reads this as task output | VERIFIED | executor.ts reads RESULT.md after query() completes; returns empty string on ENOENT; 2 unit tests cover both cases |
| WKFL-01 | 02-01, 02-03 | User can define a workflow as a YAML file with nodes (prompt executions) and edges (execution order) | VERIFIED | parseWorkflow with WorkflowDefSchema validates version, nodes (min 1), edges; 9 parser tests cover valid/invalid cases |
| WKFL-02 | 02-02, 02-03 | Workflow engine executes nodes sequentially in a defined linear chain | VERIFIED | WorkflowRunner sequential for-loop in runner.ts; stop-on-first-failure; 7 tests confirm ordering and failure propagation |

**All 6 requirements: SATISFIED by automated checks. EXEC-01/02/03 additionally require human verification for live E2E confirmation (per plan's checkpoint:human-verify task).**

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/cli/run.ts | 13-16 | ANTHROPIC_API_KEY guard commented out | WARNING | Running `agent-harness run` without API key set will fail with a confusing SDK error rather than a clear user-facing message. SUMMARY notes "should be re-enabled before production deployment". Does not block automated tests or unit tests, but reduces CLI safety for end users. |

**No blockers. One warning (commented-out API key guard).**

---

### Human Verification Required

#### 1. Template Execution End-to-End

**Test:** With `ANTHROPIC_API_KEY` set, run:
```bash
echo "List the files in the current directory and write a summary to RESULT.md" > /tmp/test-prompt.hbs
mkdir -p /tmp/test-repo && cd /tmp/test-repo && git init
npx tsx src/cli/index.ts run /tmp/test-prompt.hbs --repo /tmp/test-repo
```
**Expected:** Agent executes, `RESULT.md` is written to `/tmp/test-repo`, process exits 0.
**Why human:** Requires live `ANTHROPIC_API_KEY` and real Claude Agent SDK invocation. Cannot be reproduced in unit tests.

#### 2. HITL Question Surface and Resumption

**Test:** In terminal 1: run a question-forcing template. In terminal 2: run `agent-harness answer <run-id> "TypeScript"`.
**Expected:** Terminal 1 shows `[agent-harness] Agent asking question for run <id>`. After answering in terminal 2, terminal 1 agent resumes and completes.
**Why human:** Cross-process real-time IPC with live SDK. Cannot automate without running two concurrent processes with an active Claude session.

#### 3. API Key Guard Enforcement

**Test:** With `ANTHROPIC_API_KEY` unset, run `npx tsx src/cli/index.ts run /tmp/test-prompt.hbs --repo /tmp/test-repo`.
**Expected:** A clear error message (`[agent-harness] Error: ANTHROPIC_API_KEY environment variable is not set.`) and exit code 1.
**Why human:** The API key guard at `src/cli/run.ts` lines 13-16 is currently commented out. Per the SUMMARY, this "should be re-enabled before production deployment." Human should confirm whether this is intentionally disabled for development or should be treated as a gap. If it must be active, this rises to a WARNING that should be re-enabled.

---

### Gaps Summary

No automated gaps found. All 9 must-have truths verified, all 12 artifacts exist and are substantive, all 10 key links are wired, all 6 requirements have implementation evidence.

One warning exists: the `ANTHROPIC_API_KEY` guard in `src/cli/run.ts` is commented out. The SUMMARY acknowledges this and marks it as a pre-production concern, not a blocking gap for phase goal achievement. The phase goal (build the execution pipeline) is achieved. The human verification tasks from plan 02-03 were completed by the operator per SUMMARY (all 4 E2E tests passed).

---

_Verified: 2026-03-05T13:00:00Z_
_Verifier: Claude (gsd-verifier)_
