# Requirements: Agent Harness

**Defined:** 2026-03-04
**Core Value:** Multiple concurrent coding agent tasks run in full isolation against a codebase, coordinated by a declarative workflow graph, with human oversight surfaced at the CLI when agents need input.

## v1 Requirements

### Prompt Templates

- [ ] **TMPL-01**: User can define a prompt template as a file with `{{variable}}` substitution syntax
- [ ] **TMPL-02**: User can compose a prompt from multiple partial template files (section composition)
- [ ] **TMPL-03**: User can dry-run render a template with given variables to inspect the final prompt before execution

### Container Isolation

- [ ] **CONT-01**: Each task execution spawns a dedicated Docker container with the target repository mounted
- [ ] **CONT-02**: Container network and filesystem access is restricted to only permitted resources (no unrestricted internet/filesystem)

### Task Execution

- [ ] **EXEC-01**: User can run a prompt template against a repository with `agent-harness run <template> <repo>`
- [ ] **EXEC-02**: When the agent asks a question mid-task, execution pauses and the question is surfaced to the CLI operator
- [ ] **EXEC-03**: CLI operator can answer a surfaced question; the agent resumes with the answer
- [ ] **EXEC-04**: Agent writes structured output to a designated markdown memory bank file; harness reads this as task output

### Workflow Engine

- [ ] **WKFL-01**: User can define a workflow as a YAML file with nodes (prompt executions) and edges (execution order)
- [ ] **WKFL-02**: Workflow engine executes nodes sequentially in a defined linear chain
- [ ] **WKFL-03**: Workflow engine executes independent nodes in parallel (fan-out concurrent execution)
- [ ] **WKFL-04**: Workflow edges can define conditions based on node output to route to different next nodes
- [ ] **WKFL-05**: Workflow state is persisted to disk; interrupted workflows can be resumed from the last completed node

### Git Integration

- [ ] **GIT-01**: Each concurrent task gets its own git worktree so tasks do not share filesystem state
- [ ] **GIT-02**: Harness tracks which git branch each in-flight task is operating on

## v2 Requirements

### Container Reliability

- **CONT-V2-01**: Crashed/orphaned containers are reaped on harness startup using a persistent lockfile pattern
- **CONT-V2-02**: Harness detects and reports merge conflicts between task branches before merge

### Observability

- **OBS-V2-01**: Live status board showing all in-flight tasks, their current state, and pending questions
- **OBS-V2-02**: Structured log output per task with configurable verbosity

### Multi-Agent

- **AGNT-V2-01**: Support for additional coding agents beyond Claude Code (Aider or generic CLI interface)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Web UI or dashboard | CLI-first; web adds complexity without clear v1 value |
| Cloud/hosted execution | Local Docker only for v1; hosting adds infra complexity |
| Auto-merge of agent output | Safety feature — human merge review is intentional friction |
| Multi-agent support (v1) | Claude Code only; generalize after one agent is proven |
| Conflict detection/resolution | Deferred to v2 — detection is useful but not blocking |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TMPL-01 | — | Pending |
| TMPL-02 | — | Pending |
| TMPL-03 | — | Pending |
| CONT-01 | — | Pending |
| CONT-02 | — | Pending |
| EXEC-01 | — | Pending |
| EXEC-02 | — | Pending |
| EXEC-03 | — | Pending |
| EXEC-04 | — | Pending |
| WKFL-01 | — | Pending |
| WKFL-02 | — | Pending |
| WKFL-03 | — | Pending |
| WKFL-04 | — | Pending |
| WKFL-05 | — | Pending |
| GIT-01 | — | Pending |
| GIT-02 | — | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 0
- Unmapped: 16 ⚠️

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after initial definition*
