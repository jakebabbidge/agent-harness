---
phase: 07-restore-hitl-for-container-model
verified: 2026-03-05T18:03:30Z
status: passed
score: 8/8 must-haves verified
---

# Phase 7: Restore HITL for Container Model Verification Report

**Phase Goal:** Restore human-in-the-loop for container model
**Verified:** 2026-03-05T18:03:30Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agent-runner script inside container intercepts AskUserQuestion via canUseTool and writes question.json to /workspace/.harness/ | VERIFIED | `docker/agent-runner.js` lines 33-68: canUseTool callback checks `toolName === 'AskUserQuestion'`, writes question.json with QuestionRecord shape, polls answer.json at 500ms, returns `{ behavior: 'deny', message: answerText }` |
| 2 | Agent-runner polls for answer.json and delivers the answer text back to the agent | VERIFIED | `docker/agent-runner.js` lines 54-64: while(true) loop reads answer.json, parses AnswerRecord, extracts answer text via `Object.values(record.answers).join('\n')`, returns as deny message |
| 3 | Host-side TaskExecutor polls worktree .harness/ for question.json concurrently with waitForExit and logs the question to CLI | VERIFIED | `src/executor/executor.ts` lines 53-97: exitPromise and questionPoller run concurrently, poller reads question.json, logs each question with `console.log`, includes post-exit race condition guard |
| 4 | Container Cmd runs agent-runner.js instead of raw claude CLI | VERIFIED | `src/container/manager.ts` lines 53-56: Cmd is `['bash', '-c', 'sudo /usr/local/bin/init-firewall.sh && node /usr/local/lib/agent-runner.js']` |
| 5 | CLI operator can answer a surfaced question using agent-harness answer and the agent resumes | VERIFIED | `src/cli/answer.ts` accepts runId + answerText + options.path, uses QuestionStore.forWorktree to write answer.json; `src/cli/index.ts` lines 25-32 wire --path option into commander |
| 6 | Answer command writes answer.json to the correct worktree .harness/ path | VERIFIED | `src/cli/answer.ts` lines 8-9: `QuestionStore.forWorktree(options.path)` creates flat store at `<path>/.harness/`; submitAnswer writes answer.json there. Tests confirm in answer.test.ts |
| 7 | QuestionStore supports worktree-based IPC directories | VERIFIED | `src/hitl/question-store.ts` lines 19-21: `static forWorktree(worktreePath)` returns `new QuestionStore(path.join(worktreePath, '.harness'), true)` with flat=true so runDir ignores runId |
| 8 | Run command logs the full answer command (with worktree path) when surfacing questions | VERIFIED | `src/executor/executor.ts` lines 67-69: logs `agent-harness answer ${runId} --path ${worktreePath} "<your answer>"` |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docker/agent-runner.js` | Container-side SDK agent with canUseTool HITL interception (min 40 lines) | VERIFIED | 90 lines, full SDK integration with canUseTool, question.json write, answer.json poll, error handling, cleanup |
| `docker/Dockerfile` | Docker image with agent-sdk install and agent-runner.js baked in | VERIFIED | Line 15: `npm install -g @anthropic-ai/claude-agent-sdk`; Line 27: `COPY agent-runner.js /usr/local/lib/agent-runner.js` |
| `src/container/manager.ts` | Container creation with agent-runner.js Cmd | VERIFIED | Cmd references agent-runner.js, Env includes ANTHROPIC_API_KEY and HARNESS_IPC_DIR, promptFilePath parameter removed |
| `src/executor/executor.ts` | Host-side question polling concurrent with waitForExit | VERIFIED | Lines 53-97: concurrent polling with containerDone flag, stale cleanup, post-exit check |
| `src/hitl/question-store.ts` | QuestionStore with worktree-based path support | VERIFIED | forWorktree static factory with flat=true mode, runDir returns baseDir directly |
| `src/cli/answer.ts` | Answer command adapted for worktree-based IPC | VERIFIED | options.path support, QuestionStore.forWorktree integration, throws on error in path mode |
| `src/cli/answer.test.ts` | Tests for answer command with worktree paths (min 20 lines) | VERIFIED | 69 lines, 3 tests covering happy path, missing question, and AnswerRecord shape |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `docker/agent-runner.js` | `/workspace/.harness/question.json` | fs.writeFile on AskUserQuestion intercept | WIRED | Line 40: `fs.writeFile(questionPath, ...)` where questionPath = `path.join(ipcDir, 'question.json')` |
| `src/executor/executor.ts` | `/workspace/.harness/question.json` | polling loop concurrent with waitForExit | WIRED | Line 62: `fs.readFile(questionPath, 'utf-8')` in while(!containerDone) loop |
| `src/container/manager.ts` | `docker/agent-runner.js` | Cmd in createContainer | WIRED | Line 56: `'sudo /usr/local/bin/init-firewall.sh && node /usr/local/lib/agent-runner.js'` |
| `src/cli/answer.ts` | `src/hitl/question-store.ts` | QuestionStore.forWorktree or direct path | WIRED | Line 1: imports QuestionStore; Line 9: `QuestionStore.forWorktree(options.path)` |
| `src/cli/answer.ts` | `<worktreePath>/.harness/answer.json` | submitAnswer writes answer.json | WIRED | Line 30: `questionStore.submitAnswer(runId, answers)` which writes to runDir (flat .harness/) |
| `src/executor/executor.ts` | `src/cli/answer.ts` | printed answer command includes --path | WIRED | Line 68: logs `agent-harness answer ${runId} --path ${worktreePath} "<your answer>"` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXEC-02 | 07-01-PLAN | When the agent asks a question mid-task, execution pauses and the question is surfaced to the CLI operator | SATISFIED | agent-runner.js intercepts AskUserQuestion, writes question.json, polls for answer (pausing agent); TaskExecutor detects question.json and logs to CLI |
| EXEC-03 | 07-02-PLAN | CLI operator can answer a surfaced question; the agent resumes with the answer | SATISFIED | `agent-harness answer <runId> --path <worktree> "<answer>"` writes answer.json; agent-runner reads it and returns answer as deny message, resuming the agent |

No orphaned requirements found -- REQUIREMENTS.md maps only EXEC-02 and EXEC-03 to Phase 7.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | -- | -- | No TODO, FIXME, placeholder, or stub patterns found in any phase artifact |

### Human Verification Required

### 1. End-to-End Docker HITL Flow

**Test:** Build the Docker image, run a task that triggers AskUserQuestion, verify question appears at CLI, answer via `agent-harness answer`, confirm agent resumes.
**Expected:** Full round-trip: agent asks -> host surfaces question -> operator answers -> agent continues with answer text.
**Why human:** Requires running Docker daemon, real Claude API call, and real-time observation of IPC file exchange across container boundary.

### 2. Docker Image Build

**Test:** Run `docker build -t agent-harness:latest docker/` and verify it succeeds.
**Expected:** Image builds with @anthropic-ai/claude-agent-sdk installed globally and agent-runner.js at /usr/local/lib/agent-runner.js.
**Why human:** Requires Docker daemon and network access for npm install.

### Gaps Summary

No gaps found. All 8 observable truths are verified. All artifacts exist, are substantive, and are properly wired. Both requirements (EXEC-02, EXEC-03) are satisfied. All 28 relevant tests pass (4 skipped -- unrelated). No anti-patterns detected.

The HITL loop is fully wired end-to-end:
1. Container: agent-runner.js intercepts AskUserQuestion via canUseTool, writes question.json, polls answer.json
2. Host: TaskExecutor polls question.json concurrently, surfaces to CLI with copy-pasteable answer command
3. CLI: `agent-harness answer` with --path writes answer.json to worktree .harness/
4. Container: agent-runner.js reads answer.json, delivers answer to agent via deny message, agent resumes

---

_Verified: 2026-03-05T18:03:30Z_
_Verifier: Claude (gsd-verifier)_
