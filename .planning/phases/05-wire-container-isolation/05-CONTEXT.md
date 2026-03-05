# Phase 5: Wire Container Isolation - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate ContainerManager into the execution pipeline so every task executes inside a Docker container with restricted network and filesystem access. ContainerManager already exists from Phase 1 but needs significant rework to match the devcontainer-inspired model. Requirements: CONT-01, CONT-02.

</domain>

<decisions>
## Implementation Decisions

### Execution model
- Full agent runs inside the container (not host SDK + container tools)
- Claude Code CLI invoked as subprocess: `claude --dangerously-skip-permissions -p <prompt>`
- Host starts container, waits for process exit, reads RESULT.md from mounted worktree
- Inspired by Claude Code's own devcontainer reference: https://github.com/anthropics/claude-code/tree/main/.devcontainer

### HITL (human-in-the-loop)
- File-based IPC via mounted volume — matches existing QuestionStore pattern
- Agent writes question file to shared mount, host polls and writes answer file
- Agent resumes when answer file appears

### Container image
- Pre-built image: ship Dockerfile in repo, user builds once (`agent-harness build-image` or auto-build on first run)
- Fork the Claude Code devcontainer Dockerfile (node:20 base, Claude Code CLI, iptables, git, zsh, dev tools)
- Strip VS Code-specific parts, keep runtime essentials
- Single global image tag: `agent-harness:latest` — no per-node image overrides for v1

### Network isolation
- iptables/ipset firewall inside the container (not NetworkMode:none)
- Whitelist matching devcontainer defaults: Anthropic API, npm registry, GitHub, DNS
- Container requires `--cap-add=NET_ADMIN,NET_RAW` for iptables
- Firewall init script runs as postStart command before agent executes
- Default-deny policy: all non-whitelisted outbound traffic is dropped

### Authentication
- Mount local `~/.claude` directory into container for Claude Code auth
- No ANTHROPIC_API_KEY environment variable passthrough — use existing local credentials

### Filesystem isolation
- Drop ReadonlyRootfs — the devcontainer model doesn't use it, and Claude Code needs write access to various paths
- Worktree mounted at `/workspace` (rw)
- Firewall-based isolation replaces filesystem-based isolation

### Resource limits
- No memory/CPU limits for v1 — keep it simple
- Can add configurable limits per workflow node in a future phase

### Crash cleanup
- reclaimOrphans() already exists but isn't called — wire it into startup
- AutoRemove: true still applies for normal exit cleanup

### Claude's Discretion
- Exact container entrypoint script structure
- How to orchestrate firewall init + agent execution sequencing
- Whether to keep or remove AutoRemove flag given the new model
- ContainerManager API changes needed to support the devcontainer model

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ContainerManager` (src/container/manager.ts): Full create/stop/reclaimOrphans lifecycle — needs rework for devcontainer model (drop NetworkMode:none, drop ReadonlyRootfs, add NET_ADMIN caps, add ~/.claude mount)
- `ContainerRegistry` (src/container/registry.ts): In-memory task-to-container mapping — reusable as-is
- `QuestionStore` (src/hitl/question-store.ts): File-based IPC for HITL — needs container-mount awareness
- `TaskExecutor` (src/executor/executor.ts): Currently calls SDK query() in-process — needs rewrite to spawn CLI subprocess in container instead

### Established Patterns
- Constructor injection for Docker client (ContainerManager takes Dockerode instance)
- createContainerManager() factory for production socket path
- Worktree path passed as execution directory — containers receive this as /workspace mount
- BranchTracker shared across workflow nodes at CLI level

### Integration Points
- `cli/run.ts` and `cli/resume.ts`: Need to create ContainerManager, call reclaimOrphans on startup
- `workflow/runner.ts`: Node execution loop needs container lifecycle (create before exec, stop after)
- `TaskExecutor.executeTask()`: Must change from SDK query() to docker exec of Claude CLI
- Dockerfile + init-firewall.sh: New files to add to repo

</code_context>

<specifics>
## Specific Ideas

- "We should take as much inspiration as possible from https://code.claude.com/docs/en/devcontainer and https://github.com/anthropics/claude-code/tree/main/.devcontainer"
- Reference devcontainer uses node:20 (not alpine), installs Claude Code globally via npm, uses iptables firewall with sudoers for the node user
- The devcontainer mounts `~/.claude` config as a volume for auth persistence

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-wire-container-isolation*
*Context gathered: 2026-03-05*
