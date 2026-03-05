# Phase 2: Single-Task Execution - Research

**Researched:** 2026-03-05
**Domain:** Claude Agent SDK, YAML workflow parsing, HITL question surfacing, file-based IPC, Docker network isolation for API access
**Confidence:** HIGH (SDK docs verified), MEDIUM (HITL cross-process IPC pattern), MEDIUM (network isolation workaround)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXEC-01 | User can run `agent-harness run <template> <repo>` and the agent executes in an isolated container, producing a result | `@anthropic-ai/claude-agent-sdk` `query()` with `cwd` option maps directly to this; need CLI command wiring and worktree+container setup from Phase 1 |
| EXEC-02 | When the agent asks a question mid-task, execution pauses and the question is surfaced to the CLI operator | SDK `canUseTool` callback with `AskUserQuestion` tool pauses execution in-process; cross-process surfacing requires file-based IPC (question written to disk, harness polls) |
| EXEC-03 | CLI operator can answer a surfaced question; the agent resumes with the answer | `agent-harness answer <run-id> "answer"` writes answer to disk; harness polling loop reads it and resolves the `canUseTool` callback |
| EXEC-04 | Agent writes structured output to a designated markdown memory bank file; harness reads this as task output | Agent is instructed via system prompt to write output to `/workspace/RESULT.md`; harness reads this file after `query()` completes |
| WKFL-01 | User can define a workflow as a YAML file with nodes (prompt executions) and edges (execution order) | `yaml` npm package parses YAML; `zod` validates schema; simple node+edge typed interface covers this |
| WKFL-02 | Workflow engine executes nodes sequentially in a defined linear chain | Sequential `for` loop over sorted nodes, each awaiting `query()` completion before next; exit code from `result` message determines success |
</phase_requirements>

---

## Summary

Phase 2 connects Phase 1's infrastructure to actual Claude Code execution and surfaces the human-in-the-loop (HITL) question mechanism. The critical discovery is that Anthropic has a first-class TypeScript SDK (`@anthropic-ai/claude-agent-sdk`) that wraps the Claude Code CLI as a subprocess and exposes an async generator API with a `canUseTool` callback. This callback is the correct mechanism for question surfacing — when the agent calls the `AskUserQuestion` tool, the callback fires synchronously in-process and pauses execution until a response is returned.

The hardest engineering challenge is the **cross-process HITL problem**: the harness process that runs `agent-harness run` must surface questions to a separate CLI invocation of `agent-harness answer <run-id> "answer"`. The SDK `canUseTool` callback runs in the same Node.js process as the harness, so the design must bridge between the callback (which holds execution suspended) and the answer command (a separate CLI process). The correct pattern is file-based IPC: write a question file to a run-specific directory, poll for an answer file, and resolve the callback when the answer arrives.

The second constraint is **network access**: the Phase 1 container uses `--network none`, but the Claude Agent SDK must reach `api.anthropic.com`. The correct solution is to use a custom Docker network with a Squid proxy that allowlists `api.anthropic.com` only, rather than `--network none`. This changes the Phase 1 `ContainerManager` network mode for Claude Code containers (non-Claude containers can still use `none`).

**Primary recommendation:** Use `@anthropic-ai/claude-agent-sdk` with `canUseTool` for HITL, `yaml` for workflow parsing, `zod` for workflow schema validation, file-based IPC for cross-process question/answer, and a custom Docker network with proxy for API access. The harness orchestrates Phase 1 primitives (worktree + container) and drives the SDK.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/claude-agent-sdk` | `^0.1.x` (latest) | Programmatic Claude Code execution | Official Anthropic SDK; same engine as Claude Code CLI; exposes `canUseTool` for HITL; `cwd` option scopes agent to worktree |
| `yaml` | `^2.8.x` | YAML workflow file parsing | Ships TypeScript types; YAML 1.2 compliant; most active fork vs js-yaml; used across Node.js ecosystem |
| `zod` | `^3.x` | Runtime schema validation for workflow files | Already in project dependencies; validates parsed YAML against typed schema at runtime |
| `commander` | `^12.x` | CLI subcommand wiring (`run`, `answer`) | Already in project dependencies; add `run` and `answer` subcommands |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `uuid` | `^9.x` | Generate run IDs | Every `run` invocation needs a stable UUID for file-based IPC and state files |
| `@types/uuid` | `^9.x` | TypeScript types for uuid | Always with uuid package |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@anthropic-ai/claude-agent-sdk` | `claude -p` subprocess via `child_process` | SDK is higher-level, handles stdin/stdout multiplexing, gives typed `canUseTool` callbacks and message types; subprocess gives less control over HITL |
| `yaml` | `js-yaml` | Both valid; `yaml` has better TypeScript types and YAML 1.2 compliance; `js-yaml` is slightly more widespread but older |
| file-based IPC | Named pipes / Unix sockets | File-based is simpler, survives process restart, and works cross-platform; pipes require both sides alive simultaneously |
| Squid proxy allowlist | Docker custom network `--add-host` | Squid provides explicit domain allowlist; `--add-host` only adds DNS entries, doesn't filter traffic |

**Installation:**
```bash
npm install @anthropic-ai/claude-agent-sdk yaml uuid
npm install -D @types/uuid
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── cli/
│   ├── index.ts              # Commander entry point — `run` and `answer` subcommands
│   ├── run.ts                # `agent-harness run <template> <repo>` implementation
│   └── answer.ts             # `agent-harness answer <run-id> "answer"` implementation
├── executor/
│   ├── executor.ts           # TaskExecutor: wraps SDK query(), wires canUseTool
│   └── executor.test.ts
├── hitl/
│   ├── question-store.ts     # QuestionStore: write question file, poll for answer
│   └── question-store.test.ts
├── workflow/
│   ├── parser.ts             # WorkflowParser: parse+validate YAML workflow file
│   ├── runner.ts             # WorkflowRunner: sequential node execution
│   ├── parser.test.ts
│   └── runner.test.ts
├── container/                # Phase 1 — ContainerManager, ContainerRegistry
├── git/                      # Phase 1 — WorktreeManager, BranchTracker
├── template/                 # Phase 1 — template renderer
└── types/
    └── index.ts              # Extend with WorkflowDef, NodeDef, RunState, QuestionRecord
```

### Pattern 1: Claude Agent SDK Query with canUseTool Callback

**What:** Use `@anthropic-ai/claude-agent-sdk`'s `query()` async generator with `cwd` set to the worktree path and `canUseTool` wired to the HITL question store.

**When to use:** Every task execution.

**Example:**
```typescript
// Source: platform.claude.com/docs/en/agent-sdk/user-input (verified)
import { query } from "@anthropic-ai/claude-agent-sdk";

export async function executeTask(
  prompt: string,
  worktreePath: string,
  runId: string,
  questionStore: QuestionStore,
): Promise<TaskResult> {
  let exitCode = 1;
  let resultText = "";

  for await (const message of query({
    prompt,
    options: {
      cwd: worktreePath,              // Scope agent to this worktree
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "AskUserQuestion"],
      permissionMode: "bypassPermissions",  // No per-tool prompts; HITL via AskUserQuestion
      canUseTool: async (toolName, input) => {
        if (toolName === "AskUserQuestion") {
          // Pause here until operator answers via `agent-harness answer <runId>`
          const answer = await questionStore.askAndWait(runId, input);
          return { behavior: "allow", updatedInput: { ...input, answers: answer } };
        }
        return { behavior: "allow", updatedInput: input };
      },
    },
  })) {
    if ("result" in message) {
      exitCode = message.subtype === "success" ? 0 : 1;
    }
  }

  // Read structured output from RESULT.md in the worktree
  resultText = await fs.readFile(path.join(worktreePath, "RESULT.md"), "utf-8").catch(() => "");
  return { exitCode, resultText };
}
```

### Pattern 2: File-Based IPC for Cross-Process HITL

**What:** The `canUseTool` callback in the harness process writes a question to a JSON file in a run-specific directory. The `answer` CLI command writes an answer file to the same directory. The callback polls for the answer file and resolves when found.

**When to use:** Every `AskUserQuestion` invocation during a run.

**Directory layout:**
```
/tmp/agent-harness/runs/<run-id>/
├── question.json    # Written by canUseTool callback; read by `answer` command
└── answer.json      # Written by `answer` command; read by callback polling loop
```

**question.json format:**
```json
{
  "runId": "abc-123",
  "questions": [
    {
      "question": "Which approach should I use?",
      "header": "Approach",
      "options": [
        { "label": "Option A", "description": "..." },
        { "label": "Option B", "description": "..." }
      ],
      "multiSelect": false
    }
  ],
  "timestamp": "2026-03-05T12:00:00Z"
}
```

**answer.json format:**
```json
{
  "runId": "abc-123",
  "answers": {
    "Which approach should I use?": "Option A"
  },
  "answeredAt": "2026-03-05T12:01:00Z"
}
```

**Example — QuestionStore:**
```typescript
// Source: original design — file-based IPC pattern
import fs from "fs/promises";
import path from "path";

const RUN_DIR = (runId: string) =>
  path.join("/tmp", "agent-harness", "runs", runId);

export class QuestionStore {
  async askAndWait(
    runId: string,
    input: { questions: unknown[] },
  ): Promise<Record<string, string>> {
    const dir = RUN_DIR(runId);
    await fs.mkdir(dir, { recursive: true });

    // Write question for the operator
    await fs.writeFile(
      path.join(dir, "question.json"),
      JSON.stringify({ runId, questions: input.questions, timestamp: new Date().toISOString() }),
    );

    // Display notification to CLI operator
    console.log(`\n[agent-harness] Agent is asking a question for run ${runId}`);
    console.log(`Run: agent-harness answer ${runId} "your answer here"`);

    // Poll for answer (non-blocking: yields event loop between checks)
    const answerPath = path.join(dir, "answer.json");
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1s poll interval
      try {
        const content = await fs.readFile(answerPath, "utf-8");
        const answer = JSON.parse(content) as { answers: Record<string, string> };
        await fs.unlink(answerPath); // Consume the answer
        return answer.answers;
      } catch {
        // Not yet written — keep polling
      }
    }
  }
}
```

**Example — `answer` command:**
```typescript
// src/cli/answer.ts
import fs from "fs/promises";
import path from "path";

export async function answerCommand(runId: string, answerText: string): Promise<void> {
  const dir = path.join("/tmp", "agent-harness", "runs", runId);
  const questionPath = path.join(dir, "question.json");

  // Read the pending question
  const raw = await fs.readFile(questionPath, "utf-8");
  const { questions } = JSON.parse(raw) as { questions: Array<{ question: string }> };

  // Map the first question to the provided answer (single-answer simplification for Phase 2)
  const answers: Record<string, string> = {};
  for (const q of questions) {
    answers[q.question] = answerText;
  }

  // Write the answer file for the callback to pick up
  await fs.writeFile(
    path.join(dir, "answer.json"),
    JSON.stringify({ runId, answers, answeredAt: new Date().toISOString() }),
  );

  console.log(`Answer submitted for run ${runId}. Agent will resume shortly.`);
}
```

### Pattern 3: YAML Workflow File Format and Parser

**What:** A minimal YAML schema for a single-node workflow (WKFL-01) that is extensible to multi-node (Phase 3).

**When to use:** `agent-harness run workflow.yaml` invocation path.

**workflow.yaml example:**
```yaml
# agent-harness workflow file
version: "1"
nodes:
  - id: fix-bug
    template: templates/fix-bug.hbs
    repo: /path/to/repo
    variables:
      branch: main
      file: src/auth.ts
edges: []  # Empty = single node; Phase 3 adds sequential/parallel edges
```

**Parser:**
```typescript
// Source: eemeli.org/yaml (verified package), zod (already in project)
import { parse } from "yaml";
import { z } from "zod";
import fs from "fs/promises";

const NodeDefSchema = z.object({
  id: z.string(),
  template: z.string(),
  repo: z.string(),
  variables: z.record(z.unknown()).optional().default({}),
});

const EdgeDefSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const WorkflowDefSchema = z.object({
  version: z.string(),
  nodes: z.array(NodeDefSchema).min(1),
  edges: z.array(EdgeDefSchema).default([]),
});

export type WorkflowDef = z.infer<typeof WorkflowDefSchema>;
export type NodeDef = z.infer<typeof NodeDefSchema>;

export async function parseWorkflow(filePath: string): Promise<WorkflowDef> {
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = parse(raw); // yaml package — throws on syntax error
  return WorkflowDefSchema.parse(parsed); // zod — throws on schema mismatch
}
```

### Pattern 4: Sequential Workflow Execution (WKFL-02)

**What:** For Phase 2, a workflow with N nodes executes them in topological order. With no edges (single node), this degenerates to a single execution.

**When to use:** Every `agent-harness run workflow.yaml` invocation.

```typescript
// Source: original design — sequential async loop
export async function runWorkflow(
  workflow: WorkflowDef,
  executor: TaskExecutor,
): Promise<void> {
  // Phase 2: linear execution only (Phase 3 adds fan-out)
  const ordered = topologicalSort(workflow.nodes, workflow.edges);

  for (const node of ordered) {
    console.log(`\n[workflow] Executing node: ${node.id}`);
    const result = await executor.run(node);
    if (result.exitCode !== 0) {
      console.error(`[workflow] Node '${node.id}' failed with exit code ${result.exitCode}`);
      process.exit(result.exitCode);
    }
    console.log(`[workflow] Node '${node.id}' completed successfully`);
  }
}
```

### Pattern 5: Docker Network Configuration for Claude Code

**What:** Replace `NetworkMode: 'none'` with a custom Docker network that routes through a Squid proxy allowlisting only `api.anthropic.com`. This is required for the Claude Agent SDK subprocess to reach the Anthropic API.

**When to use:** Containers that run Claude Code (not other containers).

**Critical constraint from research:** The Claude Agent SDK runs as a subprocess inside the harness process, NOT inside the Docker container. The container mounts the worktree as a bind mount and the agent's Bash tool runs commands inside the container. The SDK itself and the harness process run on the host (or in a harness container), where network access to `api.anthropic.com` is already available.

**Two valid architectures:**

**Architecture A — Harness on host, agent Bash in container (recommended for Phase 2):**
- Harness process runs on host (or in its own container with internet access)
- SDK `cwd` is set to the worktree path
- Claude Code's built-in tools operate on the worktree files directly (no container needed for file I/O)
- The `Bash` tool runs commands in the worktree using `child_process` — not inside an isolated Docker container
- Phase 1 `ContainerManager` is NOT used for the agent's command execution in this approach
- Network isolation of Bash commands requires a different approach (sandbox settings in the SDK)

**Architecture B — Agent SDK spawned inside a Docker container (full isolation):**
- A Docker container is created with network access to `api.anthropic.com` (via proxy allowlist)
- The harness uses `docker exec` or a process spawned inside the container to run the Agent SDK
- Provides full process-level isolation including Bash commands
- More complex: requires Claude Code CLI installed inside the image

**Recommendation for Phase 2:** Use Architecture A for simplicity. The agent process runs on the host with `cwd` set to the worktree path. Use the SDK's `permissionMode: 'acceptEdits'` or `allowedTools` to control what the agent can do. Docker container isolation for agent Bash commands is a Phase 3 concern.

**Note:** Phase 1's `ContainerManager` was designed for CONT-01/CONT-02. In Phase 2, the SDK's own sandbox settings handle command isolation. The Phase 1 container infrastructure remains valid for a future hardening phase.

### Anti-Patterns to Avoid

- **Calling `claude -p` as a subprocess and parsing stdout:** The Agent SDK is the correct abstraction. Subprocess approach loses `canUseTool` callback and forces shell parsing.
- **Using `--network none` for the harness process or agent container:** The SDK requires outbound HTTPS to `api.anthropic.com`. Use SDK sandbox settings or a proxy allowlist.
- **Storing question/answer state in memory only:** If the harness crashes between question and answer, the run is unrecoverable. Write to disk immediately.
- **Blocking the event loop in the `canUseTool` callback:** Use async polling (`await setTimeout`), not synchronous busy-loops.
- **Using `dangerously-skip-permissions` without `allowDangerouslySkipPermissions: true`:** The SDK requires the flag explicitly set to enable bypass mode.
- **Not including `AskUserQuestion` in `allowedTools`:** If you restrict `tools`, you must explicitly include `AskUserQuestion` or the agent cannot ask questions.
- **Expecting `result.exitCode` without checking `message.subtype`:** The SDK `result` message has `subtype: 'success'` vs `subtype: 'error_during_execution'`. Map these to exit codes 0/1.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Claude Code subprocess management | Custom `spawn('claude', ...)` + stdout parsing | `@anthropic-ai/claude-agent-sdk` `query()` | SDK handles stdin/stdout multiplexing, JSON protocol, reconnection, and `canUseTool` pausing |
| YAML parsing | Regex-based YAML parser | `yaml` npm package | YAML spec has dozens of edge cases; the npm package is 5KB, fully tested, TypeScript-native |
| Workflow schema validation | Manual type checks | `zod` (already installed) | Provides typed parse + error messages from a single schema definition |
| Question serialization format | Custom binary format | JSON files in `/tmp/agent-harness/runs/<id>/` | JSON is human-readable (operator can inspect), portable, and trivially readable from any CLI |

**Key insight:** The Agent SDK's `canUseTool` callback is the most critical don't-hand-roll item — it is the only officially-supported mechanism for pausing Claude Code execution mid-task and resuming with user input. Custom approaches (stdout scraping, signal files without the callback) race against Claude's internal state machine.

---

## Common Pitfalls

### Pitfall 1: Claude Agent SDK Runs as Subprocess on Host — Not Inside Docker

**What goes wrong:** Developer places harness + SDK inside a `--network none` Docker container, expecting the SDK to call the Anthropic API. The SDK subprocess (Claude Code CLI) cannot reach `api.anthropic.com` and fails silently or with a network error.

**Why it happens:** The Claude Agent SDK spawns the Claude Code CLI as a Node.js subprocess. That subprocess must reach `api.anthropic.com` over HTTPS. `--network none` blocks all outbound traffic including DNS.

**How to avoid:** For Phase 2, run the harness on the host (not in a Docker container). For future containerized harness deployments, use a custom Docker network with a Squid proxy allowing `.anthropic.com`. Required domains: `api.anthropic.com`.

**Warning signs:** `ENOTFOUND api.anthropic.com` or `ECONNREFUSED` in agent SDK error output.

### Pitfall 2: `AskUserQuestion` Blocked Because Not Listed in `tools`

**What goes wrong:** `canUseTool` callback is registered but never fires for questions. The agent proceeds without asking.

**Why it happens:** When `tools` (not `allowedTools`) is specified to restrict Claude's capabilities, `AskUserQuestion` must be explicitly listed. If omitted, Claude cannot use the tool and will not ask questions.

**How to avoid:** Either omit `tools` entirely (allowing all defaults) or explicitly include `"AskUserQuestion"` in the array.

**Warning signs:** Agent completes without triggering `canUseTool` for questions even when expected.

### Pitfall 3: `canUseTool` Callback Never Called — Missing PreToolUse Hook (Python Only)

**What goes wrong:** `canUseTool` (Python: `can_use_tool`) callback never fires.

**Why it happens:** In Python SDK, a `PreToolUse` hook returning `{"continue_": True}` is required to keep the stream open for the callback. This is a Python-specific workaround; the TypeScript SDK does not require it.

**How to avoid:** This is Python-only. TypeScript SDK does not require the workaround.

### Pitfall 4: HITL Answer File Race — Stale Answer From Previous Run

**What goes wrong:** The `answer.json` from a previous run (or a failed run) is still present when a new run starts, and the new run immediately picks it up without waiting.

**Why it happens:** If the previous run crashed after writing `answer.json` but before consuming it, the file persists.

**How to avoid:** On every `run` command startup, purge the run directory for the new run ID (new UUID prevents accidental reuse; also wipe entire run directory on run start).

**Warning signs:** Agent resumes immediately without waiting for the operator — answer contains stale data.

### Pitfall 5: `spawn ENOENT` When Running Claude Agent SDK in Docker

**What goes wrong:** SDK raises `Failed to spawn Claude Code process: spawn /usr/local/bin/claude ENOENT` inside a Docker container even when `pathToClaudeCodeExecutable` is set.

**Why it happens:** The SDK has internal logic that may still attempt PATH-based resolution despite the explicit path option. Pre-flight `accessSync` passes but the actual spawn fails.

**How to avoid:** For Phase 2, run the harness on the host, not inside a Docker container. If containerization is needed in Phase 3, install Claude Code CLI globally inside the image (`npm install -g @anthropic-ai/claude-code`) and ensure `node` is on PATH.

**Warning signs:** `spawn ENOENT` errors in SDK stderr output.

### Pitfall 6: Workflow YAML `nodes` Array Empty After Parse

**What goes wrong:** `WorkflowDefSchema.parse()` throws because `nodes` is empty or undefined.

**Why it happens:** YAML anchor/alias edge cases or a user writing `nodes:` with no items.

**How to avoid:** `zod` schema enforces `z.array(NodeDefSchema).min(1)`. The error message from zod is human-readable. Catch `ZodError` at the CLI boundary and display a friendly message.

### Pitfall 7: Exit Code Not Propagated from Workflow Failure

**What goes wrong:** `agent-harness run` exits 0 even when the agent failed.

**Why it happens:** The SDK `result` message `subtype` is `"error_during_execution"` but the caller checks `message.result` instead of `message.subtype`.

**How to avoid:** Explicitly check `message.subtype === "success"` for exit code 0. All other subtypes or missing result messages map to exit code 1.

---

## Code Examples

Verified patterns from official sources:

### SDK query() — Basic Task Execution

```typescript
// Source: platform.claude.com/docs/en/agent-sdk/overview (verified 2026-03-05)
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Find and fix the bug in auth.ts",
  options: {
    cwd: "/path/to/worktree",
    allowedTools: ["Read", "Write", "Edit", "Bash", "AskUserQuestion"],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
  },
})) {
  if ("result" in message) {
    console.log("Subtype:", message.subtype);  // "success" | "error_during_execution"
    console.log("Result:", message.result);
  }
}
```

### SDK canUseTool — AskUserQuestion handler

```typescript
// Source: platform.claude.com/docs/en/agent-sdk/user-input (verified 2026-03-05)
const options = {
  canUseTool: async (toolName: string, input: Record<string, unknown>) => {
    if (toolName === "AskUserQuestion") {
      // input.questions is an array of { question, header, options, multiSelect }
      const answers = await collectAnswersFromOperator(input as { questions: Question[] });
      return {
        behavior: "allow" as const,
        updatedInput: { questions: input.questions, answers },
      };
    }
    // Auto-approve all other tools
    return { behavior: "allow" as const, updatedInput: input };
  },
};
```

### YAML workflow parse + zod validate

```typescript
// Source: eemeli.org/yaml + zod.dev (both verified)
import { parse } from "yaml";
import { z } from "zod";

const schema = z.object({
  version: z.string(),
  nodes: z.array(z.object({ id: z.string(), template: z.string(), repo: z.string() })).min(1),
  edges: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
});

const content = await fs.readFile("workflow.yaml", "utf-8");
const workflow = schema.parse(parse(content));
```

### Session ID capture for run tracking

```typescript
// Source: platform.claude.com/docs/en/agent-sdk/typescript (verified 2026-03-05)
for await (const message of query({ prompt, options })) {
  if (message.type === "system" && message.subtype === "init") {
    const sessionId = message.session_id;
    // Persist sessionId → runId mapping for resume later
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude Code headless mode (`-p` flag, subprocess stdout) | `@anthropic-ai/claude-agent-sdk` TypeScript package | June 2025 (SDK release); renamed Claude Agent SDK later in 2025 | Structured message types, `canUseTool` callback, session management — no more stdout scraping |
| `--permission-prompt-tool` MCP for HITL | `canUseTool` callback in SDK | SDK v0.1+ | Simpler in-process callback vs. standing up a full MCP server |
| `--network none` for all containers | Proxy allowlist (Squid) for agent containers | Recognized practice 2025 | Allows API access while maintaining controlled egress |
| `@anthropic-ai/claude-code` npm package SDK | `@anthropic-ai/claude-agent-sdk` | 2025 rename/refactor | `claude-agent-sdk` is the current package; `claude-code` SDK entry point is deprecated |

**Deprecated/outdated:**
- `@anthropic-ai/claude-code` as SDK import: Use `@anthropic-ai/claude-agent-sdk` instead
- Headless mode documentation: Now called "Run Claude Code programmatically"; `-p` flag still works but SDK is preferred for programmatic use
- `PreToolUse` hook workaround for `canUseTool`: Python-SDK-only; TypeScript does not require it

---

## Open Questions

1. **Architecture A vs B for Phase 2 execution isolation**
   - What we know: Architecture A (harness on host, SDK on host, worktree bind-mounted) is simpler but does not isolate agent Bash commands from the host. Architecture B (harness spawns agent SDK inside a Docker container) provides full isolation but has known ENOENT spawn issues with the SDK inside containers.
   - What's unclear: Whether the spawn ENOENT issues are fixed in the latest `@anthropic-ai/claude-agent-sdk` version; whether Phase 2 needs full Bash isolation or can defer to Phase 3.
   - Recommendation: Use Architecture A for Phase 2. Document as "agent Bash commands run on host with worktree path isolation only — not full container isolation." Phase 3 can harden this.

2. **Run state persistence between `run` and `answer` commands**
   - What we know: File-based IPC in `/tmp/agent-harness/runs/<run-id>/` works for a single host. The `run` process must stay alive (it holds the `canUseTool` callback suspended).
   - What's unclear: How to handle the operator running `answer` before the `run` process has written `question.json` (timing race). The `answer` command should either check for `question.json` existence or wait briefly.
   - Recommendation: `answer` command should verify `question.json` exists and print an error if not (do not silently write `answer.json` before a question exists — it would be consumed as a stale answer).

3. **RESULT.md structured output contract (EXEC-04)**
   - What we know: The agent must write structured output to a file that the harness reads. The system prompt must instruct the agent to write `RESULT.md` with a specific format.
   - What's unclear: The exact markdown schema for `RESULT.md` — does it need machine-parseable sections (YAML front matter?) or is free-form markdown sufficient for Phase 2?
   - Recommendation: For Phase 2, free-form markdown is sufficient. The harness reads the file as a string and treats it as `taskResult.output`. Phase 3 can add structured parsing.

---

## Validation Architecture

> nyquist_validation is enabled in .planning/config.json

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (^2.x) — already configured |
| Config file | vitest.config.ts — exists from Phase 1 |
| Quick run command | `npx vitest run src/executor/ src/hitl/ src/workflow/` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXEC-01 | `agent-harness run <template> <repo>` spawns SDK query and returns 0 on success | integration (requires ANTHROPIC_API_KEY) | `npx vitest run src/executor/executor.test.ts` | Wave 0 |
| EXEC-02 | `canUseTool` callback fires for `AskUserQuestion` and suspends execution | unit (mock SDK) | `npx vitest run src/executor/executor.test.ts` | Wave 0 |
| EXEC-03 | Writing `answer.json` unblocks the `canUseTool` callback polling loop | unit | `npx vitest run src/hitl/question-store.test.ts` | Wave 0 |
| EXEC-04 | After query() resolves, harness reads `RESULT.md` and returns its content | unit (mock FS) | `npx vitest run src/executor/executor.test.ts` | Wave 0 |
| WKFL-01 | YAML with valid schema parses to WorkflowDef; invalid YAML throws ZodError | unit | `npx vitest run src/workflow/parser.test.ts` | Wave 0 |
| WKFL-02 | WorkflowRunner executes nodes in order; second node starts after first completes | unit (mock executor) | `npx vitest run src/workflow/runner.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/hitl/ src/workflow/` (pure unit tests, no network, < 5s)
- **Per wave merge:** `npx vitest run` (all tests; EXEC-01 integration test requires `ANTHROPIC_API_KEY` env var to run)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/executor/executor.ts` + `src/executor/executor.test.ts` — covers EXEC-01, EXEC-02, EXEC-04
- [ ] `src/hitl/question-store.ts` + `src/hitl/question-store.test.ts` — covers EXEC-03
- [ ] `src/workflow/parser.ts` + `src/workflow/parser.test.ts` — covers WKFL-01
- [ ] `src/workflow/runner.ts` + `src/workflow/runner.test.ts` — covers WKFL-02
- [ ] `src/cli/run.ts` — wires `agent-harness run` command
- [ ] `src/cli/answer.ts` — wires `agent-harness answer` command
- [ ] `src/types/index.ts` — extend with `WorkflowDef`, `NodeDef`, `RunState`, `QuestionRecord`
- [ ] `npm install @anthropic-ai/claude-agent-sdk yaml uuid @types/uuid`

---

## Sources

### Primary (HIGH confidence)

- [Run Claude Code programmatically — code.claude.com/docs/en/headless](https://code.claude.com/docs/en/headless) — `-p` flag, `--output-format`, headless patterns verified
- [CLI reference — code.claude.com/docs/en/cli-reference](https://code.claude.com/docs/en/cli-reference) — full flag table including `--permission-prompt-tool`, `--allowedTools`, verified 2026-03-05
- [Handle approvals and user input — platform.claude.com/docs/en/agent-sdk/user-input](https://platform.claude.com/docs/en/agent-sdk/user-input) — `canUseTool`, `AskUserQuestion` input/output schema, TypeScript example, verified 2026-03-05
- [Agent SDK overview — platform.claude.com/docs/en/agent-sdk/overview](https://platform.claude.com/docs/en/agent-sdk/overview) — `query()` API, TypeScript SDK install, capabilities verified 2026-03-05
- [Agent SDK reference TypeScript — platform.claude.com/docs/en/agent-sdk/typescript](https://platform.claude.com/docs/en/agent-sdk/typescript) — full `Options` type including `cwd`, `canUseTool`, `permissionMode`, `spawnClaudeCodeProcess`, `env` verified
- [Hosting the Agent SDK — platform.claude.com/docs/en/agent-sdk/hosting](https://platform.claude.com/docs/en/agent-sdk/hosting) — network requirements (`api.anthropic.com`), container patterns, system requirements verified

### Secondary (MEDIUM confidence)

- [Running Claude Code CLI in Docker with Network Isolation — shaharia.com](https://shaharia.com/blog/run-claude-code-docker-network-isolation/) — Squid proxy pattern, required domain `api.anthropic.com`, environment variable setup; verified architecture details
- [yaml npm package — eemeli.org/yaml](https://eemeli.org/yaml/) — YAML 1.2 parser, TypeScript native, parse API; MEDIUM (package well-known, docs checked)
- [Claude Agent SDK spawn ENOENT Docker issue — github.com/anthropics/claude-code/issues/4383](https://github.com/anthropics/claude-code/issues/4383) — spawn ENOENT pitfall verified from GitHub issue tracker

### Tertiary (LOW confidence)

- WebSearch: Cross-process HITL file-based IPC pattern — no official docs; derived from architectural first principles and Node.js IPC documentation
- WebSearch: `spawnClaudeCodeProcess` custom Docker spawn — referenced in SDK docs but behavior not deeply verified; LOW confidence on whether ENOENT issues are fully resolved

---

## Metadata

**Confidence breakdown:**
- Standard stack (`@anthropic-ai/claude-agent-sdk`, `yaml`, `zod`): HIGH — verified from official Anthropic docs and npm package pages
- Architecture (SDK `canUseTool` HITL, file-based IPC): MEDIUM-HIGH — `canUseTool` is officially documented; file-based IPC is a derived pattern not officially specified
- Network isolation (Architecture A vs B): MEDIUM — Architecture A is clearly simpler and avoids known Docker spawn issues; Architecture B has open questions
- Pitfalls: HIGH — ENOENT Docker issue is from official GitHub tracker; `AskUserQuestion` tools-list requirement is from official SDK docs

**Research date:** 2026-03-05
**Valid until:** 2026-06-05 (stable for SDK v1 API; re-verify `@anthropic-ai/claude-agent-sdk` version before install — package was renamed from `@anthropic-ai/claude-code` SDK in 2025)
