# Phase 7: Restore HITL for Container Model - Research

**Researched:** 2026-03-05
**Domain:** File-based IPC for human-in-the-loop across Docker container boundary
**Confidence:** HIGH

## Summary

This phase restores human-in-the-loop (HITL) question surfacing for the container execution model. The original Phase 2 implementation used the `@anthropic-ai/claude-agent-sdk` `query()` function with a `canUseTool` callback to intercept `AskUserQuestion` tool calls. Phase 5 replaced this with a direct `claude --dangerously-skip-permissions` CLI invocation inside the container, removing HITL entirely.

The restoration requires three components: (1) an agent-runner Node.js script baked into the Docker image that uses the SDK's `canUseTool` callback to intercept questions and write them to a shared mount, (2) host-side polling of the worktree `.harness/` directory for question.json during container execution, and (3) adaptation of the existing `answer` CLI command to write answer.json to the worktree path.

**Primary recommendation:** Build the agent-runner as a standalone Node.js script using `query()` from `@anthropic-ai/claude-agent-sdk`, wire host-side question polling into `TaskExecutor.executeTask()` concurrent with `waitForExit()`, and adapt `QuestionStore` to accept worktree-based base directories.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use the Agent SDK (`@anthropic-ai/claude-agent-sdk`) inside the container -- NOT Claude CLI stdout parsing
- A Node.js agent-runner script replaces the current `claude --dangerously-skip-permissions -p ...` command
- The agent-runner uses the SDK's `canUseTool` callback to intercept `AskUserQuestion`, matching the original Phase 2 pattern
- All other tools are passed through (auto-approved)
- Agent-runner script baked into the Docker image (not written to .harness/ at runtime)
- `COPY docker/agent-runner.js /usr/local/lib/agent-runner.js` in the Dockerfile
- Container Cmd becomes `node /usr/local/lib/agent-runner.js`
- Install `@anthropic-ai/claude-agent-sdk` globally in the Docker image alongside Claude CLI
- `npm install -g @anthropic-ai/claude-agent-sdk` added to the Dockerfile
- Use `/workspace/.harness/` for question.json and answer.json -- reuses existing worktree bind mount
- No additional volume mounts needed
- Inside container: agent-runner writes to `/workspace/.harness/question.json`, polls `/workspace/.harness/answer.json`
- Host side: polls `<worktreePath>/.harness/question.json`, writes `<worktreePath>/.harness/answer.json`

### Claude's Discretion
- How to adapt QuestionStore for worktree-path-based IPC (vs current temp dir approach)
- Host-side polling mechanism (reuse QuestionStore or new host-side watcher)
- How to handle multi-node concurrent HITL (nodeId-scoped IPC subdirectories vs flat)
- Agent-runner error handling and cleanup on unexpected exit
- Whether to keep the existing answer CLI command as-is or adapt it for the new IPC paths

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXEC-02 | When the agent asks a question mid-task, execution pauses and the question is surfaced to the CLI operator | Agent-runner intercepts AskUserQuestion via canUseTool, writes question.json to /workspace/.harness/; host-side polls worktree .harness/ and logs question to CLI |
| EXEC-03 | CLI operator can answer a surfaced question; the agent resumes with the answer | `agent-harness answer <run-id> "<answer>"` writes answer.json to worktree .harness/ path; agent-runner polls and reads it, returns result via canUseTool allow behavior |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/claude-agent-sdk | ^0.2.69 | Agent SDK for programmatic Claude Code control | Already in package.json; provides `query()` + `canUseTool` callback |
| dockerode | ^4.0.0 | Docker API client | Already used by ContainerManager |
| Node.js fs/promises | built-in | File-based IPC (question.json/answer.json) | Existing pattern from QuestionStore |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| commander | ^12.0.0 | CLI framework | Already used; answer command adaptation |
| vitest | ^2.0.0 | Test framework | All unit tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| File polling (500ms) | fs.watch/chokidar | Polling is simpler, already proven in Phase 2, no platform-specific inotify concerns across Docker boundary |
| Flat .harness/ IPC | Subdirectory per nodeId | Flat is simpler for single-task; multi-node concurrent HITL needs nodeId scoping -- see Architecture Patterns |

## Architecture Patterns

### Component Layout
```
docker/
  agent-runner.js          # NEW: Node.js script using SDK, baked into image
  Dockerfile               # MODIFY: add sdk install + COPY agent-runner.js
src/
  hitl/
    question-store.ts      # MODIFY: support worktree-based base dir
  executor/
    executor.ts            # MODIFY: add host-side question polling
  cli/
    answer.ts              # MODIFY: resolve worktree path from runId
  container/
    manager.ts             # MODIFY: change Cmd to node agent-runner.js
```

### Pattern 1: Agent-Runner Inside Container
**What:** A standalone Node.js script that reads the prompt from `.harness/prompt.txt`, calls `query()` with a `canUseTool` callback, writes question.json when AskUserQuestion is intercepted, polls for answer.json, then resumes.
**When to use:** Every container execution.
**Example:**
```javascript
// docker/agent-runner.js
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'fs/promises';

const HARNESS_DIR = '/workspace/.harness';
const prompt = await fs.readFile(`${HARNESS_DIR}/prompt.txt`, 'utf-8');

const conversation = query({
  prompt,
  options: {
    cwd: '/workspace',
    canUseTool: async (toolName, input) => {
      if (toolName === 'AskUserQuestion') {
        // Write question to shared mount
        const questionRecord = {
          runId: 'container',
          questions: input.questions || [{ question: String(input.question || input.text || '') }],
          timestamp: new Date().toISOString(),
        };
        await fs.writeFile(
          `${HARNESS_DIR}/question.json`,
          JSON.stringify(questionRecord, null, 2),
        );
        // Poll for answer
        while (true) {
          await new Promise(r => setTimeout(r, 500));
          try {
            const raw = await fs.readFile(`${HARNESS_DIR}/answer.json`, 'utf-8');
            const answer = JSON.parse(raw);
            await fs.unlink(`${HARNESS_DIR}/answer.json`);
            // Return deny with the answer text so the agent gets it
            const answerText = Object.values(answer.answers).join('\n');
            return { behavior: 'deny', message: answerText };
          } catch { /* keep polling */ }
        }
      }
      // All other tools: auto-approve
      return { behavior: 'allow' };
    },
  },
});

// Consume the async generator to completion
for await (const message of conversation) {
  // Process messages (optional logging)
}
```

### Pattern 2: Host-Side Concurrent Polling
**What:** TaskExecutor runs question polling concurrently with `waitForExit()` using `Promise.race` or parallel promises. When a question.json appears, it logs the question to the CLI. When the container exits, polling stops.
**When to use:** During every container task execution.
**Example:**
```typescript
// In TaskExecutor.executeTask():
// Run waitForExit and question polling concurrently
const exitPromise = this.containerManager.waitForExit(taskId);
const pollForQuestions = async () => {
  const questionPath = path.join(harnessDir, 'question.json');
  while (true) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const raw = await fs.readFile(questionPath, 'utf-8');
      const question = JSON.parse(raw);
      console.log(`[agent-harness] Question from agent: ${question.questions[0]?.question}`);
      console.log(`[agent-harness] Answer with: agent-harness answer ${runId} "<your answer>"`);
      // Don't delete question.json -- leave for answer command to verify
      break; // Stop polling after surfacing (one question at a time)
    } catch { /* not yet */ }
  }
};
// Race: container exit wins and we stop polling
await Promise.race([exitPromise, pollForQuestions()]);
```

### Pattern 3: QuestionStore Path Adaptation
**What:** Adapt QuestionStore to accept a direct directory path (the worktree `.harness/` dir) instead of constructing paths from runId + baseDir.
**When to use:** Both host-side polling and answer command.
**Recommendation:** Add a static factory or overload that takes a worktree path directly.
```typescript
// Option A: New constructor parameter for direct path mode
class QuestionStore {
  constructor(baseDir?: string) { ... }

  // Add: resolve IPC dir from worktree path
  static forWorktree(worktreePath: string): QuestionStore {
    return new QuestionStore(path.join(worktreePath, '.harness'));
  }
  // When using forWorktree, runId maps to '' (flat) or nodeId (concurrent)
}
```

### Pattern 4: Multi-Node Concurrent HITL Scoping
**What:** When multiple workflow nodes run concurrently, each needs its own IPC namespace to avoid question.json collisions.
**Recommendation:** Use nodeId-scoped subdirectories under `.harness/`:
- Single-task (template mode): `.harness/question.json` (flat, no nodeId)
- Workflow mode: `.harness/hitl/<nodeId>/question.json`

The agent-runner receives the IPC subdirectory path via environment variable:
```
Env: HARNESS_IPC_DIR=/workspace/.harness  (or /workspace/.harness/hitl/<nodeId>)
```

### Pattern 5: Answer Command Path Resolution
**What:** The `answer` command needs to find the right `.harness/` directory given a runId.
**Recommendation:** Use the state manager to look up the worktree path for a given runId. The state file already contains node worktree paths.
**Alternative:** Accept worktree path directly as a CLI argument: `agent-harness answer --path <worktree> "<answer>"`. Simpler, avoids state lookup.
**Best approach:** Log the full answer command (including path) when surfacing the question, so the operator can copy-paste.

### Anti-Patterns to Avoid
- **Spawning a subprocess for Claude CLI inside the agent-runner:** The SDK's `query()` is the entry point. Do not shell out to `claude` from within agent-runner.js.
- **Using fs.watch across Docker mount boundary:** inotify events are unreliable across bind mounts on some platforms. Stick to polling.
- **Blocking waitForExit without polling:** If waitForExit blocks and no polling runs, questions are never surfaced. They MUST run concurrently.
- **Sharing question.json path across concurrent nodes:** Without nodeId scoping, concurrent workflows will overwrite each other's questions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent SDK integration | Custom Claude CLI stdout parser | `@anthropic-ai/claude-agent-sdk` `query()` + `canUseTool` | SDK handles session management, streaming, tool interception natively |
| File-based IPC | Custom binary protocol or socket IPC | Existing `QuestionStore` pattern (JSON files, 500ms polling) | Already proven in Phase 2, works across Docker bind mounts |
| Docker container management | Direct Docker API calls | Existing `ContainerManager` | Already handles lifecycle, labels, orphan recovery |

**Key insight:** This phase is primarily about wiring existing patterns together across the container boundary, not building new primitives. QuestionStore, canUseTool, and ContainerManager all exist -- they just need to be connected through the .harness/ mount.

## Common Pitfalls

### Pitfall 1: canUseTool Return Value Semantics
**What goes wrong:** Returning `{ behavior: 'deny', message: answerText }` when AskUserQuestion is intercepted may cause the agent to treat the tool call as rejected, not answered.
**Why it happens:** The SDK's `canUseTool` has two return types: `allow` (tool executes) and `deny` (tool is blocked with a message). For AskUserQuestion, you want the agent to receive the human's answer.
**How to avoid:** Test both approaches: (1) `deny` with answer as message (agent sees denial message as response), and (2) `allow` with `updatedInput` containing the answer. The Phase 2 pattern likely used `deny` with message since AskUserQuestion doesn't need to "execute" -- it just needs the answer text delivered to the model.
**Warning signs:** Agent loops asking the same question, or ignores the answer.

### Pitfall 2: Race Between Container Exit and Question Polling
**What goes wrong:** Container exits (StatusCode 0) before host-side polling detects question.json, causing the question to be lost.
**Why it happens:** If the agent asks a question and immediately exits (unlikely but possible on error), or if polling interval is too slow.
**How to avoid:** After waitForExit resolves, do one final check for question.json. If found, surface it (though the container is dead, the operator should know the question was asked).

### Pitfall 3: Stale question.json on Container Restart
**What goes wrong:** A leftover question.json from a previous run causes the host to surface an old question.
**Why it happens:** .harness/ directory persists in the worktree between runs.
**How to avoid:** Clean up question.json and answer.json in .harness/ at task start, before creating the container. TaskExecutor already creates .harness/ -- add cleanup there.

### Pitfall 4: Agent-Runner Crashes Without Cleanup
**What goes wrong:** Agent-runner writes question.json then crashes. Host keeps polling for container exit (which happens), but question is orphaned.
**Why it happens:** Unhandled exception in agent-runner after question write.
**How to avoid:** Wrap agent-runner in try/catch, clean up question.json on exit. Also, host-side should handle case where container exits while a question is pending (log warning).

### Pitfall 5: ESM Import in Global npm Install
**What goes wrong:** `agent-runner.js` fails to import `@anthropic-ai/claude-agent-sdk` with ESM errors.
**Why it happens:** Global npm install + ESM module resolution can be tricky. The SDK package has `"type": "module"` and exports via `sdk.mjs`.
**How to avoid:** Ensure agent-runner.js has proper ESM syntax (no require()), and test the global install path. May need to use `createRequire` or a shebang with `--experimental-modules` flag. Alternatively, the Dockerfile can install the SDK locally in a known directory rather than globally.

### Pitfall 6: ANTHROPIC_API_KEY Not Available in Container
**What goes wrong:** The SDK's `query()` fails because no API key is available inside the container.
**Why it happens:** The container currently gets credentials via `~/.claude:/home/node/.claude:ro` mount. The SDK may also need `ANTHROPIC_API_KEY` env var.
**How to avoid:** Pass the API key as a Docker env var in createContainer, or ensure the SDK reads from the mounted `.claude` config directory. Verify which auth mechanism the SDK uses.

## Code Examples

### Agent-Runner Script (docker/agent-runner.js)
```javascript
// Source: SDK sdk.d.ts query() signature + canUseTool type
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'fs/promises';
import * as path from 'path';

const ipcDir = process.env.HARNESS_IPC_DIR || '/workspace/.harness';
const promptPath = path.join(ipcDir, 'prompt.txt');
const questionPath = path.join(ipcDir, 'question.json');
const answerPath = path.join(ipcDir, 'answer.json');

const prompt = await fs.readFile(promptPath, 'utf-8');

const conversation = query({
  prompt,
  options: {
    cwd: '/workspace',
    canUseTool: async (toolName, input) => {
      if (toolName === 'AskUserQuestion') {
        const questions = Array.isArray(input.questions)
          ? input.questions
          : [{ question: String(input.question || input.text || JSON.stringify(input)) }];

        await fs.writeFile(questionPath, JSON.stringify({
          runId: 'container',
          questions,
          timestamp: new Date().toISOString(),
        }, null, 2));

        // Poll for answer
        while (true) {
          await new Promise(r => setTimeout(r, 500));
          try {
            const raw = await fs.readFile(answerPath, 'utf-8');
            const record = JSON.parse(raw);
            await fs.unlink(answerPath);
            // Clean up question.json too
            try { await fs.unlink(questionPath); } catch {}
            const answerText = Object.values(record.answers).join('\n');
            return { behavior: 'deny', message: answerText };
          } catch { /* keep polling */ }
        }
      }
      return { behavior: 'allow' };
    },
  },
});

let exitCode = 0;
try {
  for await (const msg of conversation) {
    if (msg.type === 'result') {
      if ('error' in msg) exitCode = 1;
    }
  }
} catch (err) {
  console.error('[agent-runner] Error:', err);
  exitCode = 1;
}

process.exit(exitCode);
```

### Dockerfile Additions
```dockerfile
# After Claude CLI install:
RUN npm install -g @anthropic-ai/claude-agent-sdk

# Copy agent-runner script
COPY agent-runner.js /usr/local/lib/agent-runner.js
```

### ContainerManager.createContainer Cmd Change
```typescript
// Before:
Cmd: ['bash', '-c',
  `sudo /usr/local/bin/init-firewall.sh && claude --dangerously-skip-permissions -p "$(cat /workspace/${promptFilePath})"`
],

// After:
Cmd: ['bash', '-c',
  `sudo /usr/local/bin/init-firewall.sh && node /usr/local/lib/agent-runner.js`
],
// Note: promptFilePath is no longer needed in Cmd -- agent-runner reads from .harness/prompt.txt directly
```

### TaskExecutor Host-Side Polling
```typescript
async executeTask(prompt: string, worktreePath: string, runId: string): Promise<TaskResult> {
  const harnessDir = path.join(worktreePath, '.harness');
  await fs.mkdir(harnessDir, { recursive: true });

  // Clean up stale IPC files from previous runs
  for (const f of ['question.json', 'answer.json']) {
    try { await fs.unlink(path.join(harnessDir, f)); } catch {}
  }

  await fs.writeFile(path.join(harnessDir, 'prompt.txt'), prompt, 'utf-8');

  const taskId = runId.slice(0, 12);
  await this.containerManager.createContainer(taskId, worktreePath, '.harness/prompt.txt');

  // Run container wait and question polling concurrently
  let containerDone = false;
  const exitPromise = this.containerManager.waitForExit(taskId).then(result => {
    containerDone = true;
    return result;
  });

  const questionPoller = (async () => {
    const questionPath = path.join(harnessDir, 'question.json');
    while (!containerDone) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const raw = await fs.readFile(questionPath, 'utf-8');
        const q = JSON.parse(raw);
        for (const item of q.questions) {
          console.log(`\n[agent-harness] Agent question: ${item.question}`);
        }
        console.log(`[agent-harness] Answer: agent-harness answer ${runId} "<your answer>"`);
        // Wait for answer to be consumed before polling for next question
        while (!containerDone) {
          await new Promise(r => setTimeout(r, 500));
          try { await fs.access(questionPath); } catch { break; }
        }
      } catch { /* no question yet */ }
    }
  })();

  const { StatusCode } = await exitPromise;
  await questionPoller; // Clean up

  // Read result
  let resultText = '';
  try {
    resultText = await fs.readFile(path.join(worktreePath, 'RESULT.md'), 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  return { exitCode: StatusCode, resultText };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct `claude` CLI in container (Phase 5) | SDK `query()` in agent-runner.js | Phase 7 | Enables canUseTool callback for HITL |
| QuestionStore with temp dir base | QuestionStore with worktree .harness/ base | Phase 7 | IPC files visible to both host and container via bind mount |
| No HITL in container model | Full HITL via file IPC | Phase 7 | Restores EXEC-02/EXEC-03 |

## Open Questions

1. **canUseTool deny vs allow for AskUserQuestion**
   - What we know: `deny` returns `{ behavior: 'deny', message: string }`, `allow` returns `{ behavior: 'allow', updatedInput?: ... }`
   - What's unclear: Which behavior correctly delivers the human's answer text to the agent. `deny` with message may cause the agent to treat it as a refusal. `allow` passes through the original tool input (question) -- the agent may never see the answer.
   - Recommendation: Start with `deny` + message (matching what the Phase 2 pattern likely did). If the agent doesn't receive answers properly, switch to `allow`. This is testable in the first smoke test.

2. **SDK Auth Inside Container**
   - What we know: Container mounts `~/.claude:/home/node/.claude:ro`. The SDK may use this for auth.
   - What's unclear: Whether `query()` uses the mounted `.claude` dir for API key resolution or needs `ANTHROPIC_API_KEY` env var.
   - Recommendation: Pass `ANTHROPIC_API_KEY` as env var to the container via `createContainer` options. If the `.claude` mount alone works, this is redundant but harmless.

3. **Global npm Install ESM Compatibility**
   - What we know: SDK is `"type": "module"` with `sdk.mjs` entry.
   - What's unclear: Whether `import { query } from '@anthropic-ai/claude-agent-sdk'` works from a globally-installed script running via `node /usr/local/lib/agent-runner.js`.
   - Recommendation: If global import resolution fails, install SDK locally in `/usr/local/lib/` and use relative import. Alternative: the agent-runner could use `createRequire` to resolve the global path.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.x |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXEC-02 | Agent question written to question.json, host polls and surfaces | unit | `npx vitest run src/executor/executor.test.ts -t "question polling" -x` | Needs new tests |
| EXEC-02 | Agent-runner writes question.json on AskUserQuestion intercept | unit | `npx vitest run src/hitl/agent-runner.test.ts -x` | Needs new file |
| EXEC-03 | answer command writes answer.json to correct worktree path | unit | `npx vitest run src/cli/answer.test.ts -x` | Needs new file |
| EXEC-03 | Agent-runner resumes after reading answer.json | unit | `npx vitest run src/hitl/agent-runner.test.ts -t "resumes" -x` | Needs new file |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/executor/executor.test.ts` -- add tests for concurrent question polling behavior
- [ ] `src/cli/answer.test.ts` -- new file covering worktree-path answer resolution
- [ ] `docker/agent-runner.js` -- manual integration test (requires Docker), but canUseTool logic can be unit tested in isolation as `src/hitl/agent-runner.test.ts`

## Sources

### Primary (HIGH confidence)
- `@anthropic-ai/claude-agent-sdk` v0.2.69 `sdk.d.ts` -- `query()`, `canUseTool`, `CanUseTool`, `PermissionResult` type definitions read directly from node_modules
- Project source code: `src/hitl/question-store.ts`, `src/executor/executor.ts`, `src/container/manager.ts`, `src/cli/answer.ts`, `src/cli/run.ts`, `docker/Dockerfile`
- Existing test files: `src/hitl/question-store.test.ts`, `src/executor/executor.test.ts`

### Secondary (MEDIUM confidence)
- Phase 2 decisions in STATE.md regarding canUseTool patterns, 500ms polling interval, answer.json consumption

### Tertiary (LOW confidence)
- canUseTool deny vs allow behavior for AskUserQuestion -- inferred from type signatures, not validated with SDK runtime behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, versions confirmed from package.json
- Architecture: HIGH - patterns directly derived from existing code (QuestionStore, ContainerManager, canUseTool types)
- Pitfalls: MEDIUM - ESM global install and canUseTool semantics need runtime validation
- Agent-runner script: MEDIUM - based on SDK type signatures, not tested end-to-end

**Research date:** 2026-03-05
**Valid until:** 2026-03-19 (14 days -- SDK may update, but core patterns stable)
