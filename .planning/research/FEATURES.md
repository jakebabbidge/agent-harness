# Feature Research

**Domain:** Coding agent orchestration CLI tool (wrapping LLM coding agents)
**Researched:** 2026-03-04
**Confidence:** MEDIUM — Training data through August 2025; WebSearch/WebFetch unavailable. Domain knowledge from LangGraph, AutoGen, CrewAI, Prefect, Temporal, Aider, Claude Code, and adjacent tools. Marked LOW where specific claims rely on a single training-data source.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in an agent harness. Missing these = product feels broken or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| CLI entry point with clear subcommands | Any developer tool ships a clean CLI; `run`, `status`, `logs` are baseline expectations | LOW | `agent-harness run <workflow>` is the primary surface; must be scriptable and composable with pipes |
| Prompt template system with variable substitution | Agent prompts are parameterized; hardcoded prompts are unusable for different projects/contexts | MEDIUM | Mustache, Handlebars, or custom `{{variable}}` syntax — users expect at minimum named variables injected at runtime |
| Task execution with captured output | Run an agent task, capture stdout/stderr, get an exit code — the UNIX primitive | LOW | Without this, the tool has no observable output |
| Configuration file support (YAML/JSON) | Developers expect to check workflow definitions into git alongside code | LOW | File-based config is the dominant pattern (GitHub Actions, Docker Compose, Temporal workflows) |
| Logging / execution trace | Users need to know what happened during a run — which agent ran, what it produced, errors | MEDIUM | Structured logs (JSON or human-readable with levels) are expected; raw terminal output is insufficient |
| Error handling with non-zero exit codes | CI/CD pipelines depend on exit codes; if agent fails, the harness must propagate failure | LOW | Missing this breaks every pipeline integration |
| Dry-run / validation mode | Users want to validate config before burning agent credits | LOW | `--dry-run` flag that validates workflow graph without executing |
| Task cancellation / interrupt handling | Ctrl+C during a long agent run must clean up gracefully | MEDIUM | Container cleanup, temp branch cleanup, signal propagation |
| Environment variable passthrough | Agents need API keys and secrets; these come from the shell environment | LOW | Secure passthrough without logging secret values |
| Basic concurrency (run N tasks) | If the tool claims concurrent execution, it must actually parallelize | HIGH | Core value proposition; failing here makes the tool a sequential task runner |

### Differentiators (Competitive Advantage)

Features that set the product apart. These are where agent-harness competes.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Container-based isolation per task | Full tool permission control per task — not just filesystem sandboxing. Each agent gets its own Docker container with scoped mounts, network rules, and tool access. Rewrites are safe; tasks can't corrupt each other | HIGH | Key architectural differentiator vs. worktree-only solutions. Prevents "agent deletes production config" scenarios. Requires Docker daemon; adds startup latency (~2-5s per container) |
| Graph-based workflow with conditional routing | Workflows are DAGs, not linear pipelines. Nodes declare typed inputs/outputs; edges route based on output values. Enables branching ("if tests pass, proceed; else retry with debug context") | HIGH | LangGraph popularized graph-based agent workflows. YAML/JSON declarative definition makes this inspectable and version-controllable |
| Human-in-the-loop question surfacing | Agent pauses mid-task, surfaces a question to the CLI operator, resumes after answer. Prevents agents from making irreversible decisions autonomously | HIGH | Competitive differentiator vs. fully-autonomous tools. Requires inter-process communication between container and host CLI. The "pause/resume" mechanism is architecturally complex |
| Git-native task tracking | Each concurrent task runs on its own git branch (worktree or clone). Merge strategy, conflict detection, and PR creation are first-class features | HIGH | Turns the workflow into an auditable git history. Competitors use ad-hoc temp dirs; git-native tracking is reproducible and debuggable |
| Typed node contracts (inputs/outputs schema) | Workflow nodes declare what they consume and produce. The harness validates at graph-load time that all edges are type-compatible. Catches config mistakes before execution | MEDIUM | Inspired by typed DAG systems (Prefect, Dagster). Prevents "string passed where file path expected" class of bugs |
| Composable prompt sections | Prompts composed from reusable named sections (e.g., `persona`, `context`, `task`, `constraints`). Sections can be overridden at the workflow node level | MEDIUM | More powerful than simple variable substitution. Enables a library of reusable prompt components. Similar to template inheritance in Jinja2 |
| Task retry with context enrichment | On agent failure, retry the task with additional context injected (error output, last attempt summary). Not just "retry same prompt" | MEDIUM | Naive retry wastes credits. Context-enriched retry has much higher success rate |
| Observability: structured execution events | Emit structured events (task_started, agent_question, task_completed, node_routed) to a log sink. Enables downstream processing, alerting, dashboards | MEDIUM | JSON-LD or OpenTelemetry compatible events. Even without a dashboard, structured events enable grep-based debugging |
| Pluggable agent adapters | Architecture accommodates swapping Claude Code for another agent (GPT Engineer, Aider, etc.) via a thin adapter interface — even if only Claude Code is supported in v1 | MEDIUM | Prevents architectural lock-in. Users trust tools that won't trap them |
| Workspace snapshot / restore | Before running a destructive workflow, snapshot the repo state. On failure, restore to snapshot. Safety net for experiments | MEDIUM | Git-native: create a snapshot tag before run, restore to tag on failure |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. These should be explicitly deferred or rejected.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Web UI / dashboard | "Visualize the workflow graph" — compelling demo value | Adds a server component, browser dependency, auth surface. Orthogonal to CLI-first value. Premature investment before core is proven | Rich CLI output: ASCII workflow graph, color-coded task status, live progress via terminal. Enough for v1 |
| Multi-agent support (LLM-to-LLM delegation) | Enables complex multi-agent pipelines where one LLM spawns sub-agents | Massively increases complexity of the question-surfacing and permission models. Each sub-agent needs its own container, question queue, credential scope. Ship one agent well first | Design the adapter interface so adding a second agent later is a targeted change, not a rewrite |
| Auto-merge of agent output branches | "Save the human review step" — faster iteration | Agents produce incorrect code. Auto-merge without human review causes production incidents. The one thing that destroys trust in the tool | Surface the merge command and diff summary; require human to run `agent-harness merge <task-id>`. Friction here is a feature |
| Real-time streaming output to CLI | Showing every token the agent produces feels alive and responsive | High IPC complexity between container and host. Streaming adds backpressure and buffer management. For parallel tasks, interleaved streams are unreadable | Structured progress updates (task milestone events) with final output dump. Users care about milestones, not every token |
| Cloud execution / remote agents | Run agents on managed infrastructure, not local Docker | Dramatically increases scope: auth, billing, networking, data residency, secrets management. Out of scope for v1 — local-only | Make container spec portable (standard Docker) so users can point at remote Docker daemon themselves if needed |
| Fully autonomous mode (no human questions) | "Run without interruption" appeal for CI | Removes the safety mechanism that prevents irreversible mistakes. The harness's value includes the human gate | Provide a `--non-interactive` flag that fails-fast when a question is surfaced, rather than proceeding autonomously |
| Plugin marketplace / extension system | "Extensibility" — developer-friendly | Plugin systems require stable public APIs, semver discipline, security review of third-party code. This is a v3+ concern | Expose a clean adapter interface and document it. Let early users fork before formalizing a plugin contract |
| GUI prompt editor | Visual editing of prompt templates | Prompt templates are text files — developers prefer their editor. A GUI adds a non-CLI dependency and UX surface to maintain | Use standard file formats (Markdown with YAML frontmatter) that any editor handles well |

---

## Feature Dependencies

```
[Container isolation per task]
    └──requires──> [Docker daemon available on host]
    └──requires──> [Task lifecycle management (start/stop/cleanup)]
                       └──requires──> [Signal handling / graceful shutdown]

[Concurrent task execution]
    └──requires──> [Container isolation per task]
    └──requires──> [Git-native task tracking (branch per task)]
                       └──requires──> [Git worktree or clone per task]

[Graph-based workflow execution]
    └──requires──> [YAML/JSON config loading and validation]
    └──requires──> [Typed node contracts (inputs/outputs)]
    └──enhances──> [Conditional routing based on node output]
                       └──requires──> [Structured task output (not raw stdout)]

[Human-in-the-loop question surfacing]
    └──requires──> [IPC channel between container and host CLI]
    └──requires──> [Task pause/resume mechanism]
    └──conflicts──> [Fully autonomous mode]

[Composable prompt sections]
    └──enhances──> [Prompt template system with variable substitution]
    └──requires──> [Prompt template loader (file-based)]

[Task retry with context enrichment]
    └──requires──> [Structured task output]
    └──requires──> [Graph-based workflow execution (retry is a graph edge)]

[Observability: structured execution events]
    └──enhances──> [All features] (passive; emits events from each)
    └──requires──> [Structured task output]

[Git-native task tracking]
    └──enhances──> [Concurrent task execution]
    └──requires──> [Git available on host]
```

### Dependency Notes

- **Container isolation requires Docker:** Docker (or compatible runtime like Podman) must be installed. This is a hard prerequisite that must be documented prominently. No Docker = no isolation.
- **Concurrent execution requires git-native tracking:** Without branch-per-task, concurrent tasks would overwrite each other's changes. Git is the isolation mechanism at the filesystem level even when containers handle process isolation.
- **Human-in-the-loop conflicts with fully autonomous mode:** The `--non-interactive` flag should fail-fast (exit non-zero) when a question is surfaced, not silently proceed. These are mutually exclusive behaviors, not a mode switch.
- **Graph-based routing requires structured output:** Conditional routing decisions (e.g., "route to fix-tests node if test output contains failures") require the harness to parse agent output, not just capture raw text. Structured output (exit codes + JSON side-channel, or parsed stdout) must be established before routing logic can be built.
- **Composable prompts enhance but don't block:** Variable substitution can ship first; section composition is an enhancement that makes the prompt system more powerful without being a prerequisite.

---

## MVP Definition

### Launch With (v1)

Minimum needed to validate: can the harness run concurrent isolated agent tasks with human oversight?

- [ ] CLI entry point (`agent-harness run <workflow-file>`) — the tool needs to be invokable
- [ ] YAML workflow config loading with node/edge definition — workflows must be declarative
- [ ] Prompt template system with variable substitution — agents need parameterized prompts
- [ ] Container-based isolation per task (Docker) — core safety guarantee
- [ ] Concurrent task execution (N tasks in parallel) — validates the core value prop
- [ ] Git branch per task (worktree or clone) — enables concurrent writes to same codebase
- [ ] Human-in-the-loop question surfacing (pause/resume) — validates safety mechanism
- [ ] Structured logging / execution trace — operators must see what happened
- [ ] Graceful shutdown with container cleanup — Ctrl+C must not leave zombie containers
- [ ] Error propagation with exit codes — required for any CI/CD integration

### Add After Validation (v1.x)

Add once core concurrent + isolated execution is proven.

- [ ] Conditional routing in workflow graph — trigger: users need branching beyond linear execution
- [ ] Typed node contracts with schema validation — trigger: users report config errors at runtime that should be caught earlier
- [ ] Composable prompt sections (beyond variable substitution) — trigger: users managing large prompt libraries
- [ ] Task retry with context enrichment — trigger: users report wasted retries from naive retry loops
- [ ] Workspace snapshot/restore — trigger: users report fear of running destructive workflows

### Future Consideration (v2+)

Defer until product-market fit is established.

- [ ] Pluggable agent adapters (support Aider, GPT Engineer, etc.) — defer: validate Claude Code integration first; adding a second agent requires a stable adapter contract
- [ ] OpenTelemetry / structured event emission — defer: overkill until users have observability pipelines to connect
- [ ] Workflow library / community templates — defer: need enough workflows in the wild before extracting patterns
- [ ] `--non-interactive` CI mode — defer: need to understand how users integrate with CI before designing the flag behavior

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| CLI entry point + subcommands | HIGH | LOW | P1 |
| YAML workflow config | HIGH | LOW | P1 |
| Prompt template variable substitution | HIGH | LOW | P1 |
| Container isolation per task | HIGH | HIGH | P1 |
| Concurrent task execution | HIGH | HIGH | P1 |
| Git branch per task | HIGH | MEDIUM | P1 |
| Human-in-the-loop question surfacing | HIGH | HIGH | P1 |
| Structured logging | HIGH | MEDIUM | P1 |
| Graceful shutdown / cleanup | HIGH | MEDIUM | P1 |
| Error propagation (exit codes) | HIGH | LOW | P1 |
| Conditional workflow routing | HIGH | HIGH | P2 |
| Typed node contracts | MEDIUM | MEDIUM | P2 |
| Composable prompt sections | MEDIUM | MEDIUM | P2 |
| Task retry with context enrichment | MEDIUM | MEDIUM | P2 |
| Workspace snapshot/restore | MEDIUM | MEDIUM | P2 |
| Pluggable agent adapters | MEDIUM | HIGH | P3 |
| OpenTelemetry event emission | LOW | HIGH | P3 |
| Workflow template library | LOW | LOW | P3 |
| `--non-interactive` CI mode | MEDIUM | LOW | P3 |

**Priority key:**
- P1: Must have for launch (v1)
- P2: Should have, add when core is validated (v1.x)
- P3: Nice to have, future consideration (v2+)

---

## Competitor Feature Analysis

Tools analyzed: LangGraph (workflow graphs), AutoGen (multi-agent), CrewAI (role-based agents), Temporal (durable workflows), Aider (CLI coding agent), GitHub Actions (CI workflow model), Claude Code (the wrapped agent itself).

| Feature | LangGraph / AutoGen | Aider (CLI agent) | GitHub Actions | Agent Harness (our approach) |
|---------|---------------------|-------------------|----------------|------------------------------|
| Workflow as code vs config | Code (Python graph definition) | None (interactive CLI) | YAML config | YAML/JSON config — declarative, no-code |
| Container isolation | None by default | None | Yes (each job is containerized) | Yes — Docker per task, explicit |
| Concurrent tasks | Yes (parallel node execution) | No | Yes | Yes — core value prop |
| Human-in-the-loop | Optional interrupt handlers | Interactive by default | Manual approval gates | Mid-task question surfacing with CLI pause |
| Git integration | None | Commits, amends | Branch triggers, PR actions | Branch-per-task, git as task tracking |
| Prompt management | Python code (not templates) | System prompt file | N/A | Composable template library |
| Observability | Langsmith (paid), callbacks | Terminal output | Action logs | Structured events (local, no cloud dependency) |
| Permission control | Python process-level | Host filesystem access | Scoped secrets | Container-scoped tool access |
| Target audience | ML/AI engineers (Python) | Individual developers | DevOps/platform teams | Engineering teams running agent workflows |

**Key insight:** No existing tool combines (a) declarative YAML workflows, (b) container-per-task isolation, (c) concurrent execution, and (d) human-in-the-loop question surfacing in a single CLI-first package. LangGraph is closest on graph semantics but is Python-code-first, not config-first, and has no isolation story. GitHub Actions has the right mental model (YAML DAG, containers, approval gates) but is cloud-CI-only, not local.

---

## Sources

- Training knowledge through August 2025: LangGraph docs, AutoGen GitHub, CrewAI docs, Temporal docs, Aider GitHub, Claude Code documentation
- WebSearch and WebFetch were unavailable during this research session — all findings reflect training data
- Confidence notes: Container isolation patterns (HIGH — well-established Docker practices); LangGraph/AutoGen feature sets (MEDIUM — may have evolved since August 2025); specific Claude Code IPC/API details (LOW — verify against current Claude Code SDK docs before implementation)

**Verification recommended before implementation:**
- Claude Code's actual IPC/SDK interface for question-surfacing (how does an agent signal a question to an orchestrator?)
- Docker SDK for Node.js current API (dockerode or alternatives)
- Whether Claude Code supports `--output-format json` or structured output mode for conditional routing

---
*Feature research for: Coding agent orchestration CLI tool (agent-harness)*
*Researched: 2026-03-04*
