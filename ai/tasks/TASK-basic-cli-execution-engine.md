# TASK: Basic CLI execution engine

## Summary

Add a CLI `run` command that takes an arbitrary prompt string, executes it against Claude Code inside a managed Docker container, and prints the agent's results back to the CLI via a shared-volume IPC mechanism. Also add a `login` command that drops the user into an interactive container shell to complete the Claude Code `/login` OAuth flow.

## Motivation

The execution engine is the core value proposition of Agent Harness — running agents in isolation. This task delivers the minimal end-to-end flow: prompt in, agent runs in Docker, results out. The login command is a prerequisite for auth, since Claude Code OAuth credentials must be established inside the container environment before non-interactive runs will work.

## Relevant context

- Domains: [CLI](../domains/cli.md), [Execution](../domains/execution.md), [Adapters](../domains/adapters.md)
- Files/components: `src/cli/index.ts`, `src/main.ts`, new `src/execution/`, new `src/adapters/`, new `.devcontainer/`
- ADRs: [Docker for agent isolation](../adr/docker-isolation.md), [Claude Code OAuth](../adr/claude-code-oauth.md)

## Reference material

The Docker container setup should be based on the official Claude Code devcontainer:

- Docs: https://code.claude.com/docs/en/devcontainer.md
- Reference implementation: https://github.com/anthropics/claude-code/tree/main/.devcontainer

Key details from the reference:

- **Base image**: `node:20`
- **Claude Code install**: `npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`
- **Container capabilities**: `--cap-add=NET_ADMIN`, `--cap-add=NET_RAW` (for firewall)
- **Config persistence**: mount a volume to `/home/node/.claude` for OAuth credentials
- **Container env**: `CLAUDE_CONFIG_DIR=/home/node/.claude`, `NODE_OPTIONS=--max-old-space-size=4096`
- **Non-root user**: runs as `node`
- **Firewall**: `init-firewall.sh` restricts outbound to whitelisted domains (GitHub, npm, Anthropic API, etc.)
- **Run flag**: `claude --dangerously-skip-permissions` enables unattended operation inside the secured container

## Scope

- Add a `run <prompt>` CLI command that accepts a prompt string as a positional argument
- Add a `login` CLI command that builds the Docker image (if needed), starts a container with the `~/.claude` volume mounted, and attaches an interactive shell so the user can run `claude` and complete `/login`
- Create a Dockerfile based on the Claude Code devcontainer reference (Dockerfile, init-firewall.sh)
- Implement Docker image build logic (build once, reuse until Dockerfile changes)
- Implement Docker container lifecycle management: create, start, wait for completion, remove
- Mount the host's `~/.claude` directory (or a named volume) into the container at `/home/node/.claude` for credential persistence across runs
- Mount a shared volume/directory for IPC output: the agent writes its results to a known file path inside the container, and the CLI reads from the corresponding host path after the container exits
- Run Claude Code inside the container with `--dangerously-skip-permissions` and the user's prompt, directing output to the shared IPC path
- CLI reads the output file from the shared volume after the container exits and prints it to stdout
- Handle container build/run errors with clear error messages

## Out of scope

- Repo mounting or repo isolation (worktrees, directory copies)
- Prompt templates or the prompt engine — prompt is a raw string from CLI args
- Question/answer flow (pausing, queuing, resuming)
- Workflow engine integration
- Concurrent/parallel task execution
- Task state tracking (running, paused, completed, failed)
- Streaming output in real-time (batch output after completion is sufficient)
- Custom firewall configuration or network policy customisation
- PDF/CSV or any structured output format

## Acceptance criteria

- [ ] `agent-harness login` builds the Docker image if not already built, starts a container with `~/.claude` credentials mounted, and drops the user into an interactive shell inside the container
- [ ] After running `claude /login` inside the interactive container, credentials are persisted such that subsequent containers can authenticate without re-login
- [ ] `agent-harness run "your prompt here"` builds the Docker image if not already built, starts a container, runs Claude Code with the given prompt and `--dangerously-skip-permissions`, writes agent output to a shared volume, and prints the output to the CLI's stdout
- [ ] The Docker container is cleaned up (removed) after each `run` execution, whether it succeeds or fails
- [ ] If Docker is not running or not installed, the CLI prints a clear error message and exits with a non-zero code
- [ ] If the Docker image build fails, the CLI prints the build error output and exits with a non-zero code
- [ ] If Claude Code exits with a non-zero code inside the container, the CLI reports the failure and exits with a non-zero code
- [ ] The Dockerfile installs Claude Code globally via npm and runs as the `node` user
- [ ] The shared volume IPC mechanism uses a known file path that both the container process and the host CLI agree on
- [ ] Unit tests cover container lifecycle logic (build, create, start, wait, remove) with Docker commands mocked
- [ ] Integration test verifies the `run` and `login` commands are registered and accept the expected arguments

## Verification checklist

- [ ] Code implemented
- [ ] Tests added/updated
- [ ] Lint/format passed
- [ ] Manual verification completed
- [ ] Docs updated if needed
