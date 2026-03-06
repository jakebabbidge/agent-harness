# TASK: Question surfacing via hooks

## Summary

Intercept Claude Code's `AskUserQuestion` tool inside the Docker container using a `PermissionRequest` hook, relay questions to the host CLI via file-based IPC on the shared volume, and prompt the user interactively during the `run` command.

## Motivation

The execution engine currently runs Claude Code in fire-and-forget mode — if the agent asks a question, it has no way to reach the user. This blocks agent workflows that require clarification. Surfacing questions interactively during `run` is a prerequisite for reliable agent-driven coding sessions.

## Relevant context

- Domains: [CLI](../domains/cli.md), [Execution](../domains/execution.md), [Adapters](../domains/adapters.md)
- Files/components:
  - `src/cli/index.ts` — `run` command handler (currently waits for exit, needs to poll for questions)
  - `src/execution/container-lifecycle.ts` — `executeRun()` orchestration, shared volume setup
  - `src/execution/docker.ts` — `runContainer()` (currently blocks until exit, needs to support async/streaming)
  - `src/adapters/claude-code.ts` — `buildCommand()` (may need adjustment for hook setup)
  - `docker/Dockerfile` — needs hook script and settings.json baked in
- ADRs: [Docker for agent isolation](../adr/docker-isolation.md)
- Reference: `research/question-interception.md` — hook protocol spec

## Scope

- Create a hook handler script that runs inside the Docker container, is invoked by Claude Code's `PermissionRequest` hook, and:
  - Reads the JSON payload from stdin
  - If `tool_name === "AskUserQuestion"`: writes the question data to a known file on the shared volume, then polls for an answer file, and returns the answer in the required `hookSpecificOutput` JSON format
  - If `tool_name !== "AskUserQuestion"`: returns `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}` (auto-approve all other permissions, since the container is already sandboxed)
- Register the hook in a Claude Code `settings.json` baked into the Docker image at the appropriate config path (`/home/node/.claude/settings.json`), under `hooks.PermissionRequest`
- Define a file-based IPC protocol on the shared volume for question/answer exchange (e.g. `question-<id>.json` written by hook, `answer-<id>.json` written by host, hook polls for answer)
- Update `executeRun()` to run the container asynchronously (not blocking until exit) so the host can poll the shared volume for question files while the container is still running
- Update the `run` command handler in the CLI to poll for question files during execution, display questions to the user in the terminal (with options if provided), collect the user's response via stdin, and write the answer file to the shared volume
- Clean up IPC files after the run completes
- Update the Dockerfile to include the hook script

## Out of scope

- `getQuestions(taskId)` / `answerQuestion(taskId, questionId, answer)` APIs on the execution engine — questions are handled inline during `run` only
- Separate `questions` CLI command or queue-based question management
- Concurrent/parallel task question routing
- Workflow engine integration
- Permission request forwarding to the user (auto-approve all non-AskUserQuestion permissions inside the container)
- Real-time streaming of agent output during execution (batch output after completion is still fine)
- HTTP-based IPC

## Acceptance criteria

- [ ] A hook handler script exists in the Docker build context and is included in the built image
- [ ] The Docker image contains a Claude Code `settings.json` that registers the hook under `hooks.PermissionRequest` with `type: "command"` pointing to the hook script
- [ ] When Claude Code calls `AskUserQuestion` inside the container, the hook writes a question JSON file (containing the question text and options) to the shared volume at a predictable path
- [ ] The hook blocks (polls) until a corresponding answer file appears on the shared volume, then reads the answer and returns the correct `hookSpecificOutput` JSON to Claude Code via stdout
- [ ] If the hook encounters an error or times out waiting for an answer, it returns `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"ask"}}}` as a safe fallback
- [ ] For non-`AskUserQuestion` permission requests, the hook returns an allow decision without writing to the shared volume
- [ ] The `run` command polls the shared volume for question files while the container is running
- [ ] When a question file is detected, the CLI displays the question text (and numbered options if present) to the user in the terminal
- [ ] The CLI collects the user's answer via terminal input and writes the answer file to the shared volume
- [ ] After the user answers, the container-side hook picks up the answer and Claude Code resumes execution
- [ ] After the container exits, the CLI still reads and prints the final agent output as before
- [ ] IPC files (question and answer JSON files) are cleaned up after the run completes
- [ ] Unit tests cover the hook script's stdin parsing, question file writing, answer file polling, and stdout JSON generation
- [ ] Unit tests cover the CLI-side question polling, display, and answer writing logic
- [ ] Integration test verifies the end-to-end question/answer round-trip using mocked Docker execution

## Verification checklist

- [ ] Code implemented
- [ ] Tests added/updated
- [ ] Lint/format passed
- [ ] Manual verification completed
- [ ] Docs updated if needed
