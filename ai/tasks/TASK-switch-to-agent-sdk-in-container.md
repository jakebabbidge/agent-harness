# TASK: Switch in-container execution from Claude Code CLI to Agent SDK

## Summary

Replace the current `claude -p` CLI invocation inside the Docker container with a TypeScript runtime that uses the `@anthropic-ai/claude-agent-sdk` `query()` function. The runtime code lives in the main project (compiled TypeScript), and the built output is copied into the container image. Additionally, replace the current `executeLogin` flow with a token-extraction script that runs `claude setup-token` and stores the OAuth token in `~/.agent-harness/token.json`.

## Motivation

The Agent SDK provides a programmatic TypeScript API for running Claude Code, giving us:
- Programmatic hooks (replace the file-based `hook-handler.mjs` with in-process callbacks)
- Typed message streaming (structured `AssistantMessage`, `ResultMessage`, etc.)
- Direct control over `settingSources`, `allowedTools`, and `systemPrompt`
- Testable runtime code that lives in the main project and benefits from the existing TypeScript/Vitest toolchain

## Relevant context

- Domains: [Execution](../domains/execution.md), [Adapters](../domains/adapters.md)
- Files/components:
  - `src/adapters/adapter.ts` — `AgentAdapter` interface
  - `src/adapters/claude-code.ts` — current CLI-based adapter
  - `src/execution/container-lifecycle.ts` — `executeRun()`, `executeLogin()`
  - `docker/Dockerfile` — container image definition
  - `docker/hook-handler.mjs` — current file-based IPC hook handler
  - `docker/settings.json` — current hook configuration
  - `package.json` / `tsconfig.json` — build configuration
- ADRs: [Docker for agent isolation](../adr/docker-isolation.md), [Claude Code OAuth](../adr/claude-code-oauth.md)

## Scope

### In-container runtime

- Create a new TypeScript entry point (e.g. `src/runtime/agent-runner.ts`) that:
  - Reads a prompt from a known file path (passed via env var or CLI arg)
  - Reads the OAuth token from a known file path and sets `CLAUDE_CODE_OAUTH_TOKEN` env var
  - Calls `query()` from `@anthropic-ai/claude-agent-sdk` with the prompt
  - Uses a programmatic `PreToolUse` hook on `AskUserQuestion` to implement the question IPC protocol (write question JSON to shared dir, poll for answer JSON — same protocol as current `hook-handler.mjs`)
  - Writes the final result to the output file
- The runtime is compiled as part of `pnpm build` (same `tsconfig.json` or a dedicated one)
- The compiled runtime JS is copied into the Docker image

### Adapter changes

- Update `AgentAdapter` interface and `ClaudeCodeAdapter` to reflect the new invocation: the container command now runs `node /opt/agent-harness/agent-runner.js <args>` instead of `claude -p`
- Remove `buildCommand`'s dependency on shell-escaping a raw prompt string (prompt is read from a file instead)

### Dockerfile changes

- Add `@anthropic-ai/claude-agent-sdk` to the container (either `npm install -g` or copy the compiled bundle that includes it)
- Copy the compiled runtime into the container image (e.g. to `/opt/agent-harness/`)
- Remove the `hook-handler.mjs` copy and `settings.json` copy (no longer needed — hooks are programmatic)
- Keep `init-firewall.sh`, iptables, and the firewall setup unchanged

### Token extraction (login replacement)

- Create a script or CLI command that:
  1. Runs `claude setup-token` and captures stdout/stderr
  2. Extracts the token matching pattern `sk-ant-oat01-[A-Za-z0-9_-]+`
  3. Writes `{"CLAUDE_CODE_OAUTH_TOKEN": "<token>"}` to `~/.agent-harness/token.json`
- Update `executeLogin()` (or replace it) to run this token extraction instead of launching an interactive bash session
- Update `executeRun()` to read the token from `~/.agent-harness/token.json` and pass it into the container (e.g. via bind mount or env var)

### Container lifecycle changes

- Update `executeRun()` in `container-lifecycle.ts`:
  - Write the rendered prompt to a file in the temp dir (instead of passing as CLI arg)
  - Pass the OAuth token into the container (bind mount `~/.agent-harness/token.json` or pass as env var)
  - Remove the `settings.json` copy logic (no longer needed)
  - The question IPC protocol (file-based polling) remains the same, but is now driven by the in-container runtime's programmatic hook instead of `hook-handler.mjs`

### Cleanup

- Remove `docker/hook-handler.mjs`
- Remove `docker/settings.json`
- Remove shell-escape logic from `ClaudeCodeAdapter`

## Out of scope

- Changing the question IPC protocol itself (file-based JSON polling stays)
- Changing the Docker isolation model or firewall rules
- Adding support for non-Claude agent backends
- Changing the CLI command surface (`run`, `login`, etc.)
- Workflow engine changes
- Prompt engine changes

## Acceptance criteria

- [ ] `@anthropic-ai/claude-agent-sdk` is added as a project dependency
- [ ] A TypeScript runtime entry point exists (e.g. `src/runtime/agent-runner.ts`) that calls `query()` with a prompt read from a file
- [ ] The runtime uses a programmatic `PreToolUse` hook on `AskUserQuestion` to write question JSON and poll for answer JSON via the existing IPC file protocol
- [ ] The runtime writes the final agent result to the output file
- [ ] The runtime reads the OAuth token from a known path and sets `CLAUDE_CODE_OAUTH_TOKEN`
- [ ] `pnpm build` compiles the runtime entry point
- [ ] The Dockerfile copies the compiled runtime into the image and installs the agent SDK
- [ ] The Dockerfile no longer copies `hook-handler.mjs` or `settings.json`
- [ ] `executeRun()` writes the prompt to a file in the temp dir and mounts it into the container
- [ ] `executeRun()` passes the OAuth token into the container
- [ ] The container command invokes `node /opt/agent-harness/agent-runner.js` (not `claude -p`)
- [ ] A token extraction flow runs `claude setup-token`, extracts the `sk-ant-oat01-...` token via regex, and writes it to `~/.agent-harness/token.json`
- [ ] `executeLogin()` is replaced with (or calls) the token extraction flow
- [ ] `docker/hook-handler.mjs` and `docker/settings.json` are deleted
- [ ] Existing unit tests pass; new tests cover the runtime entry point and token extraction logic
- [ ] Lint and format checks pass

## Verification checklist

- [ ] Code implemented
- [ ] Tests added/updated
- [ ] Lint/format passed
- [ ] Manual verification completed
- [ ] Docs updated if needed
