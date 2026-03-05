# Phase 7: Restore HITL for Container Model - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Restore human-in-the-loop question surfacing for the container execution model. When an agent running inside a Docker container asks a question, the question is surfaced at the CLI and the operator can answer it, resuming the agent. This was removed during the Phase 5 container rewrite and needs to be re-added through the container boundary using file-based IPC on mounted volumes. Requirements: EXEC-02, EXEC-03.

</domain>

<decisions>
## Implementation Decisions

### Agent-side question mechanism
- Use the Agent SDK (`@anthropic-ai/claude-agent-sdk`) inside the container — NOT Claude CLI stdout parsing
- A Node.js agent-runner script replaces the current `claude --dangerously-skip-permissions -p ...` command
- The agent-runner uses the SDK's `canUseTool` callback to intercept `AskUserQuestion`, matching the original Phase 2 pattern
- All other tools are passed through (auto-approved)

### Agent-runner script location
- Baked into the Docker image (not written to .harness/ at runtime)
- `COPY docker/agent-runner.js /usr/local/lib/agent-runner.js` in the Dockerfile
- Container Cmd becomes `node /usr/local/lib/agent-runner.js`

### SDK installation
- Install `@anthropic-ai/claude-agent-sdk` globally in the Docker image alongside Claude CLI
- `npm install -g @anthropic-ai/claude-agent-sdk` added to the Dockerfile

### IPC path strategy
- Use `/workspace/.harness/` for question.json and answer.json — reuses existing worktree bind mount
- No additional volume mounts needed
- Inside container: agent-runner writes to `/workspace/.harness/question.json`, polls `/workspace/.harness/answer.json`
- Host side: polls `<worktreePath>/.harness/question.json`, writes `<worktreePath>/.harness/answer.json`

### Claude's Discretion
- How to adapt QuestionStore for worktree-path-based IPC (vs current temp dir approach)
- Host-side polling mechanism (reuse QuestionStore or new host-side watcher)
- How to handle multi-node concurrent HITL (nodeId-scoped IPC subdirectories vs flat)
- Agent-runner error handling and cleanup on unexpected exit
- Whether to keep the existing answer CLI command as-is or adapt it for the new IPC paths

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `QuestionStore` (src/hitl/question-store.ts): File-based IPC with askAndWait/submitAnswer/getQuestion — needs path adaptation from temp dir to worktree-based .harness/
- `answerCommand` (src/cli/answer.ts): CLI answer handler — needs to locate question.json at the worktree path instead of temp dir
- `ContainerManager` (src/container/manager.ts): Full container lifecycle with devcontainer model — Cmd needs to change from claude CLI to agent-runner.js
- `TaskExecutor` (src/executor/executor.ts): Already writes prompt to .harness/prompt.txt — agent-runner can read from same location

### Established Patterns
- Constructor injection for Docker client (ContainerManager)
- canUseTool callback for HITL interception (Phase 2 pattern, removed in Phase 5)
- File-based IPC with JSON serialization and 500ms polling interval
- answer.json consumed (deleted) immediately after read to prevent stale pickup

### Integration Points
- `docker/Dockerfile`: Add agent-sdk install and agent-runner.js COPY
- `ContainerManager.createContainer()`: Change Cmd from claude CLI to `node /usr/local/lib/agent-runner.js`
- `TaskExecutor.executeTask()`: May need to start host-side polling for questions during container wait
- `cli/answer.ts`: Adapt to find question.json via worktree path (needs runId-to-worktree mapping or direct path)

</code_context>

<specifics>
## Specific Ideas

- Agent-runner script inside the container mirrors the original Phase 2 canUseTool pattern — write question.json, poll answer.json, resume
- The Dockerfile already installs Claude CLI globally; adding the Agent SDK follows the same pattern
- .harness/ directory is already created by TaskExecutor before container start, so it's guaranteed to exist

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-restore-hitl-for-container-model*
*Context gathered: 2026-03-05*
