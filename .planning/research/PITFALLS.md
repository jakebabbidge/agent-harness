# Pitfalls Research

**Domain:** Coding agent orchestration CLI — containerized execution, concurrent tasks, workflow graphs, human-in-the-loop
**Researched:** 2026-03-04
**Confidence:** HIGH for container/concurrency patterns; MEDIUM for Claude Code SDK-specific behavior

---

## Critical Pitfalls

### Pitfall 1: Container Lifecycle Leaks Under Failure

**What goes wrong:**
Containers created for agent tasks are not cleaned up when tasks fail, are cancelled, or when the CLI process is killed with SIGKILL (as opposed to SIGTERM). Over time, zombie containers accumulate, exhaust Docker's available resources, and leave dangling volumes and networks. This is the single most common operational failure in container-per-task systems.

**Why it happens:**
Developers handle the happy path — task completes, container stops, cleanup runs. They miss: process.on('SIGTERM') handlers that still don't fire on SIGKILL; unhandled promise rejections that skip finally blocks; the case where the CLI crashes before the cleanup callback is registered; and Docker containers that were started but whose reference was lost from in-memory state.

**How to avoid:**
- Never rely solely on in-process cleanup. Persist container IDs to a lockfile (e.g., `.agent-harness/running.json`) at creation time, before any task logic runs.
- On CLI startup, read the lockfile and reap any containers that were running when the process last died.
- Register cleanup handlers for SIGTERM, SIGINT, and uncaughtException/unhandledRejection — but understand SIGKILL cannot be caught; the startup-reap pattern is the only defense.
- Use `docker run --rm` only when you are confident your cleanup path is bulletproof; otherwise manage removal explicitly so the lockfile approach can clean up.
- Set explicit resource limits (--memory, --cpus) on every container so a leaked container cannot starve the host.

**Warning signs:**
- `docker ps -a` shows stopped containers from previous harness runs
- Disk usage grows between runs
- `docker network ls` shows orphaned harness networks
- Tests pass in isolation but fail when run after a previous aborted run

**Phase to address:** Container execution foundation (earliest container work)

---

### Pitfall 2: Deadlock in Human-in-the-Loop Question Surfacing

**What goes wrong:**
Agent tasks block waiting for a human answer; the CLI's question-surfacing channel blocks waiting to deliver the question; and the concurrency model has no way to interleave "answer delivery" with "continue running other tasks." The result is a deadlock or a frozen CLI that appears to be working but is actually waiting for input it cannot display.

**Why it happens:**
This happens when question delivery and task execution share a single synchronous execution context, or when the IPC channel between the container and the host is not designed to be non-blocking in both directions. A second failure mode: the operator answers the question but the answer delivery fails silently, leaving the task permanently paused.

**How to avoid:**
- Treat question surfacing as an async message queue, not a synchronous RPC call. The task emits a "question event" with a correlation ID; the host receives it on a dedicated channel (e.g., a named pipe, Unix domain socket, or watched file) and displays it. The task polls for an answer on a separate channel.
- Implement a timeout on unanswered questions with a configurable default action (fail task, use a default value, or skip). Never allow a task to block indefinitely without operator awareness.
- Design the CLI's display loop to be non-blocking: it should be able to show multiple pending questions from concurrent tasks and accept answers for any of them, not just the most recent.
- Test the "answer delivered but task never unblocks" scenario explicitly.

**Warning signs:**
- CPU drops to 0% for all tasks simultaneously during a run
- `docker stats` shows all containers in a steady state with no I/O
- The question prompt appears but typing an answer produces no response
- A task "hangs" but logs show no errors

**Phase to address:** Human-in-the-loop / IPC phase

---

### Pitfall 3: Git Conflict Corruption from Concurrent Task Branches

**What goes wrong:**
Two concurrent tasks modify overlapping files. Merging their outputs (via git) produces conflict markers in the codebase that then get passed as "code" to subsequent workflow nodes or committed as artifacts. This silently corrupts the downstream task's context.

**Why it happens:**
Developers implement the "each task gets its own git worktree/branch" model correctly, but treat merging as a post-step that is always clean. Real codebases have overlapping edits. The workflow graph does not enforce "no two tasks touch the same file" because that constraint is invisible at workflow-definition time.

**How to avoid:**
- Merge detection is mandatory, not optional. After any task completes and before its output is consumed by the next node, run `git merge --no-commit --no-ff` in a dry-run mode and check for conflicts. If conflicts exist, surface them as a blocking question to the operator, not as a silent "done."
- Design the workflow graph schema to support optional "merge strategy" declarations per node: auto-merge (ours/theirs), fail-on-conflict, or human-review.
- Never pass raw git-merged output to subsequent agents without a conflict-free verification step.
- Store each task's output on an isolated branch until an explicit "integrate" step runs.

**Warning signs:**
- `<<<<<<< HEAD` appears anywhere in task output artifacts
- Subsequent agents produce syntactically invalid code after a merge phase
- Task B succeeds immediately after Task A but produces worse results than A alone

**Phase to address:** Concurrent task coordination / git integration phase

---

### Pitfall 4: Prompt Template Combinatorial Explosion

**What goes wrong:**
The composable prompt template system starts with clean variable substitution and section composition. As workflows grow, templates reference other templates, sections are conditionally included based on task state, and variables are filled from multiple sources (workflow inputs, task outputs, environment). The result is a template rendering system with implicit evaluation order, hidden dependencies, and outputs that are nearly impossible to inspect or debug.

**Why it happens:**
Each template addition seems small. The system works for the first 5 templates. By template 20, with deeply nested section includes and variable inheritance across levels, rendering a prompt requires mentally executing a mini-interpreter. Debugging a malformed prompt means reading the final rendered output and working backward — a process that breaks down quickly.

**How to avoid:**
- Enforce a strict two-level model: base templates (pure variable substitution, no includes) and composite templates (assemble sections, no re-nesting). Do not allow composite templates to include other composite templates.
- Build a `agent-harness template render --dry-run` command from day one. Prompt inspection must be a first-class feature, not an afterthought.
- Every template variable must have an explicit source declaration. No implicit "fall through to environment" resolution.
- Log the fully-rendered prompt (with redaction options) on every task run, stored alongside other task artifacts.

**Warning signs:**
- Developers cannot explain what a rendered prompt will look like without running it
- Template test coverage is skipped because "it's just text"
- A single template change fixes one workflow but breaks three others
- Debugging a bad agent output requires reading raw rendered prompts buried in logs

**Phase to address:** Prompt template system phase

---

### Pitfall 5: Agent Output Parsing Brittleness

**What goes wrong:**
The harness extracts structured data (file paths, answers, workflow routing values) from agent output by parsing text. Claude's output format changes slightly across model versions, prompt variations, or context length differences. The parser breaks silently — it either returns empty/null data, or worse, extracts incorrect values — and downstream tasks proceed with garbage inputs.

**Why it happens:**
Text-based parsing of LLM output is inherently fragile. Developers write a regex that works for the first 10 outputs. The agent is then prompted differently and produces valid output in a different format. The parser returns null. The code's null-handling path proceeds with a default value that isn't correct. No error is surfaced.

**How to avoid:**
- Instruct the agent to produce structured output in a machine-readable section: e.g., `<!-- OUTPUT_JSON: {...} -->` or a fenced code block with explicit type tags. Parse only the structured section, treat absence as a parsing failure, and fail loudly.
- Never silently fall back to a default value on parse failure. Fail the task with a clear error: "agent output did not include expected structured output block."
- Version the output format in the prompt: "Respond with HARNESS_OUTPUT_V1: {...}". If the format evolves, the parser can handle both V1 and V2 without ambiguity.
- Build a corpus of at least 10 real agent outputs per task type and run the parser against them in unit tests on every CI build.

**Warning signs:**
- Workflow routing takes the "else" branch unexpectedly and nobody notices
- Tasks are marked "succeeded" but produced no file changes
- The same workflow produces different results on re-runs with identical inputs
- Parser unit tests are absent or have < 5 examples

**Phase to address:** Workflow execution / agent output handling phase

---

### Pitfall 6: Workflow State Not Persisted — No Resume After Crash

**What goes wrong:**
A 10-node workflow runs for 45 minutes. The CLI crashes at node 7. There is no way to resume from node 7 — the operator must restart from node 1 and re-run the entire workflow, re-spending API tokens and re-running completed container tasks.

**Why it happens:**
Workflow state (which nodes completed, their outputs, which are in-flight) is held entirely in memory. This feels fine during development because workflows are short. It becomes a serious operational problem once workflows span multiple minutes and API calls.

**How to avoid:**
- Persist workflow execution state to a local state file (e.g., `.agent-harness/runs/<run-id>/state.json`) after every node transition. This file is the source of truth for resume.
- Support `agent-harness resume <run-id>` as a first-class command from the beginning — do not retrofit it later.
- Node outputs must be persisted as artifacts alongside state. Do not store them only in memory.
- Design state transitions to be atomic: write the new state to a `.tmp` file first, then rename. A partial write should never corrupt the state file.

**Warning signs:**
- The team re-runs entire workflows after any failure "just to be safe"
- There is no `runs/` or equivalent output directory per workflow execution
- Developers add `console.log` to figure out where a workflow failed

**Phase to address:** Workflow execution engine phase (foundation, not later)

---

### Pitfall 7: IPC Channel Between Container and Host Is an Afterthought

**What goes wrong:**
The initial implementation uses stdout/stderr capture to communicate between the containerized agent and the harness host. This seems sufficient until: (a) the agent's stdout contains mixed structured output and human-readable logs with no reliable delimiter; (b) the host needs to send data back to the agent mid-run (answers to questions); (c) the agent needs to report progress events without completing. Retrofitting a real IPC channel after the fact is expensive.

**Why it happens:**
stdout capture is the obvious first approach and works for the simplest case. The problem is that every edge case of real bidirectional communication requires a more structured channel, and by the time these edge cases appear, the architecture is already baked in.

**How to avoid:**
- Design the host-container IPC protocol before writing the first container. Choose one of: a Unix domain socket mounted into the container, a named pipe pair, or a dedicated local HTTP/WebSocket server the container connects to on startup.
- Define a simple message envelope on day one: `{ type, correlationId, payload }`. All future communication (questions, answers, progress, structured output) uses this envelope.
- Stdout/stderr remain for human-readable logs only. Never parse them for control flow.

**Warning signs:**
- Code that parses stdout with regex to detect "is the agent done?"
- Progress reporting is absent because "it's hard to add"
- Human-in-the-loop questions are delivered by watching for a special string in stdout

**Phase to address:** Container execution foundation phase (IPC must be designed here, not added later)

---

### Pitfall 8: Workflow Graph Allows Cycles Without Cycle Detection

**What goes wrong:**
The YAML/JSON workflow definition accidentally (or intentionally) introduces a cycle. Without explicit cycle detection at parse time, the workflow engine enters an infinite loop, running tasks and consuming API tokens until the operator force-kills the process.

**Why it happens:**
YAML/JSON DAG definitions are easy to write incorrectly. A "retry" pattern that routes a failed node back to an earlier node is a legitimate use case that looks like a cycle. Without explicit "this is a retry loop with a max iteration count" semantics, the engine cannot distinguish intent from accident.

**How to avoid:**
- Validate workflow graphs at load time, before any execution begins. Run a DFS cycle detection on the graph. Reject graphs with cycles unless they are explicitly annotated with `max_iterations: N`.
- Report the exact cycle path in the validation error: "Cycle detected: node_a → node_b → node_c → node_a"
- Implement a global maximum iteration counter per workflow run as a safety valve even for intentional loops.

**Warning signs:**
- A workflow run consumes unexpectedly large API costs
- `docker ps` shows the same container image started many times in sequence
- A "running" workflow shows the same node name repeating in logs

**Phase to address:** Workflow graph parsing / validation phase

---

### Pitfall 9: Claude Code Container Authentication Is Not Isolated Per Task

**What goes wrong:**
The ANTHROPIC_API_KEY is injected into all task containers from the host environment. This is correct. However, if the Claude Code configuration directory (e.g., `~/.claude/`) is mounted into each container, concurrent tasks can corrupt each other's session state, or a compromised task container can read credentials or conversation history from other tasks.

**Why it happens:**
It's convenient to mount the host's Claude config directory so the agent "just works" with existing configuration. Developers don't think about what else that directory contains (auth tokens, conversation logs, project-specific settings) or what concurrent write access to a shared directory does.

**How to avoid:**
- Each task container gets its own isolated Claude config directory, created fresh (or from a sanitized template) at task start.
- The only shared secret is the API key, injected as an environment variable. Nothing else from the host's Claude config is mounted.
- The container's filesystem should be ephemeral by default. Any outputs the harness needs are copied out via a designated output directory before the container stops.

**Warning signs:**
- Multiple containers mount the same directory from the host
- Task A's conversation history appears in Task B's context
- Claude Code config changes made inside a container persist after the container stops

**Phase to address:** Container isolation / security phase

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| In-memory workflow state only | Faster to build | No resume, no crash recovery, all runs lost on exit | Never — persist from day one |
| Parse agent output from raw stdout | No IPC protocol to design | Brittle, breaks on format change, blocks bidirectional comms | Prototype only, must be replaced before any real workflow |
| Single shared git repo for all concurrent tasks (no worktrees/branches) | Simpler git setup | Concurrent tasks corrupt each other's changes | Never — isolation is non-negotiable |
| Flat template variables (no nesting) | Easy to implement | Does not support real workflow output chaining | MVP is fine; add structured variable sources in next phase |
| Skip container resource limits | Fewer flags to manage | A runaway agent task can OOM the host | Never — set limits from day one |
| Synchronous question surfacing (block main loop) | Simpler code | Deadlocks when multiple tasks ask questions simultaneously | Never with concurrency > 1 |
| Hardcoded output format parsing | Works for known prompts | Breaks silently on any model or prompt change | Prototype only |
| No run ID / no output directory per run | Less filesystem clutter | Cannot distinguish artifacts from different runs, no audit trail | Never — run IDs are foundational |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Docker SDK / Docker CLI | Spawning `docker` CLI subprocess for every operation | Use the Docker Engine API directly (dockerode for Node.js) to avoid subprocess overhead and get structured responses |
| Docker SDK / Docker CLI | Not setting a `--stop-timeout` on containers | Set explicit stop timeout so graceful shutdown is bounded; SIGKILL follows after N seconds |
| Claude Code SDK | Assuming the SDK exposes a clean "ask question → get answer" API | Claude Code's interaction model is streaming; design the IPC layer around streaming events, not request-response |
| Claude Code SDK | Treating the SDK as stable between minor versions | Pin the exact SDK version in package.json; add an upgrade test harness before bumping versions |
| Git worktrees | Using worktrees and assuming HEAD is the same as the main repo | Each worktree has its own HEAD; operations that reference "current branch" behave differently in worktrees |
| Git worktrees | Not cleaning up worktrees on task failure | Orphaned worktrees accumulate and confuse git operations on the main repo; add worktree cleanup to the lockfile reap pattern |
| Node.js child_process | Using `child_process.exec` with large stdout | exec buffers all output in memory; use spawn with streaming for any output that could be large |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Creating a new Docker image build on every task run | Task startup takes 30-120 seconds per task | Pre-build a base agent image; task containers are instances of that image, not new builds | Any real workflow with > 2 tasks |
| Polling Docker container status in a tight loop | CPU spikes on the host during task runs | Use Docker event streaming (`docker events`) instead of polling container status | 5+ concurrent tasks |
| Loading entire task artifact (agent output file) into memory for parsing | Memory grows proportionally to output size | Stream parse or set a hard output size limit and fail loudly if exceeded | Agent produces large outputs (e.g., full file rewrites) |
| Workflow state file write on every log line | I/O bound, especially on network filesystems | Buffer state transitions; only write on actual node state changes, not on log events | Verbose agents that emit many events |
| Spawning a git process per file to check conflict status | Slow merge detection across many files | Batch git status checks; one `git status --porcelain` covers all files | Tasks that touch > 20 files |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Passing the host ANTHROPIC_API_KEY as a Docker environment variable without isolation | If the container is compromised or logs are leaked, the key is exposed | Use Docker secrets or a per-task temporary credential scope if the API supports it; at minimum, never log environment variables |
| Mounting the entire project directory as a writable volume | A malicious or buggy agent can delete or overwrite any project file | Mount only the specific worktree for that task; mount the parent project read-only if the agent needs context from it |
| Not validating YAML/JSON workflow files before execution | A crafted workflow file could trigger path traversal, inject shell commands into template substitution, or loop infinitely | Validate against a strict schema; sanitize all template variable values before substitution; treat workflow files as untrusted input |
| Allowing template variable values to contain shell metacharacters | Shell injection if variables are ever interpolated into a command string | Never interpolate template variables into shell commands; pass as environment variables or structured arguments |
| Container running as root | Any container escape or volume mount abuse has root-level host access | Set `--user` to a non-root UID in all task containers; verify the Claude Code image supports non-root operation |
| Logging full rendered prompts by default | Prompts may contain secrets from environment variables or sensitive codebase context | Redact known secret patterns from prompt logs; make full prompt logging opt-in |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress indication during long-running tasks | Operator cannot tell if the task is running, stuck, or done; kills processes prematurely | Stream progress events from the container; show a live status line per task (which node, elapsed time, last event) |
| Surfacing all agent questions at once in a wall of text | Operator cannot distinguish which question belongs to which task | Tag each question with task ID, node name, and timestamp; show one question at a time per task with clear visual separation |
| Workflow run output scattered across console and no artifact directory | Operator cannot find task outputs after the run | Create a `runs/<run-id>/` directory structure before execution starts; all artifacts, logs, and state go there |
| Cryptic error messages from Docker SDK failures | Operator does not know if a failure is their fault or a system fault | Translate Docker API errors into human-readable messages with remediation hints (e.g., "Container failed to start — is Docker running?") |
| `agent-harness run` exits immediately on workflow parse error with no detail | Operator has to guess what is wrong with their YAML | Provide line-level validation errors with the offending YAML key path and a link to schema docs |
| Concurrency level defaulting to "unlimited" | Host OOMs or thrashes on large workflows | Default to `min(4, nCPUs)` concurrent tasks; document how to override; warn if concurrency > nCPUs |

---

## "Looks Done But Isn't" Checklist

- [ ] **Container cleanup:** Containers are removed on success — but verify they are also removed on failure, timeout, and CLI crash (check with `docker ps -a` after a force-kill test)
- [ ] **Question surfacing:** A question prompt appears — but verify the task actually unblocks and continues after the answer is submitted (not just that the UI shows the answer)
- [ ] **Concurrent tasks:** Two tasks run simultaneously — but verify they cannot see each other's git changes, container filesystems, or Claude config directories
- [ ] **Workflow graph validation:** Valid graphs execute — but verify that a graph with a typo in a node reference gives a clear error at parse time, not a runtime failure 10 minutes in
- [ ] **State persistence:** Workflow state is written to disk — but verify a resume after `kill -9` on the CLI process actually continues from the correct node with correct outputs
- [ ] **Template rendering:** Templates substitute variables — but verify that a missing variable fails loudly rather than silently rendering as an empty string in the prompt
- [ ] **Agent output parsing:** Structured output is extracted — but verify the parser returns a clear error (not null/undefined) when the agent produces valid output in an unexpected format
- [ ] **Git merge:** Task branches merge without error on the happy path — but verify the merge step detects conflicts and blocks rather than committing conflict markers
- [ ] **Resource limits:** Tasks run within limits — but verify a container that exceeds its memory limit is killed and the harness reports it as a failure, not a timeout

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Container leak accumulation | LOW | `docker ps -a --filter label=agent-harness=true` to find all harness containers; `docker rm -f` each; add a `agent-harness cleanup` command that does this automatically |
| HITL deadlock | MEDIUM | Kill and restart the affected task container; design tasks to be idempotent so restart is safe; use the state file to resume from the deadlocked node |
| Git conflict corruption in artifacts | HIGH | Each task's branch is isolated; discard the merge, resolve conflicts manually, re-run the integration step; never commit conflict markers — add a pre-commit hook to block this |
| Workflow state corruption (partial write) | MEDIUM | Keep the previous state file as `.state.json.bak`; on corrupt state detection, fall back to the backup and re-run from the last known-good checkpoint |
| Prompt template regression (model format change) | MEDIUM | Revert the template or prompt to the last known-good version; add the new format to the output parser; add the new output example to the parser test corpus |
| No resume capability (in-memory state lost) | HIGH | Only recovery is full workflow restart; motivation to implement persistence from day one |
| Cycle in workflow graph consuming API budget | HIGH | Force-kill the CLI; add cycle detection validation; review API usage dashboard for unexpected spend |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Container lifecycle leaks | Container execution foundation | Run `docker ps -a` after force-killing CLI; zero harness containers should remain |
| HITL question deadlock | IPC / human-in-the-loop phase | Integration test: two concurrent tasks both ask questions simultaneously; both must unblock independently |
| Git conflict corruption | Concurrent task coordination phase | Integration test: two tasks modify the same file; verify conflict is surfaced, not silently committed |
| Prompt template combinatorial explosion | Prompt template system phase | `template render --dry-run` exists and is tested; rendering errors are explicit |
| Agent output parsing brittleness | Workflow execution / output handling phase | Parser unit test corpus of >= 10 real outputs; CI runs parser tests on every build |
| Workflow state not persisted | Workflow execution engine phase (foundational) | `resume` command exists and passes force-kill recovery test |
| IPC channel afterthought | Container execution foundation phase | No stdout regex parsing anywhere in codebase; all control messages use the envelope format |
| Workflow graph cycles | Workflow graph parsing / validation phase | Unit test: cyclic graph returns parse error with cycle path; no cycle ever executes |
| Claude config not isolated per task | Container isolation / security phase | Two concurrent tasks cannot read each other's Claude config directories |

---

## Sources

- Patterns from LangGraph, AutoGen, and CrewAI post-mortems and issue trackers (agent state management, HITL deadlocks) — HIGH confidence, widely documented
- Docker container lifecycle management best practices (container leaks, resource limits, cleanup on crash) — HIGH confidence, official Docker documentation and operational experience
- Claude Code SDK behavior (streaming output, subprocess model) — MEDIUM confidence; based on public SDK documentation through August 2025; verify current SDK event model before implementation
- Temporal.io and Prefect workflow engine design patterns (state persistence, resume, cycle detection) — HIGH confidence, well-documented in their respective architectures
- Git worktree concurrent access patterns — HIGH confidence, based on git internals documentation
- General concurrent system design pitfalls (IPC design, deadlocks, resource exhaustion) — HIGH confidence

---
*Pitfalls research for: coding agent orchestration CLI (containerized execution, concurrent tasks, workflow graphs, HITL)*
*Researched: 2026-03-04*
