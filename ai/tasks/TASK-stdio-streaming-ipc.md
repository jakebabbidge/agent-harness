# TASK: Replace file-based IPC with NDJSON stdio streaming

## Summary

Replace the current file-based polling IPC mechanism (question/answer JSON files over a shared volume) with newline-delimited JSON (NDJSON) over container stdio. All container-to-host communication streams over stdout; host-to-container messages (prompt delivery and answers) flow over stdin. The message protocol must be agent-agnostic — no Claude Code or Agent SDK concepts leak into the wire format.

## Motivation

The current file-based polling approach has fundamental limitations:
- No streaming — thinking messages, tool use events, and progress updates are discarded (`agent-runner.ts:68-79` iterates `query()` messages but only captures the final result)
- Polling adds latency (300ms host-side, 500ms container-side) and complexity (atomic writes, temp files, cleanup, race conditions)
- stdout is already wired up via `spawn()` with piped stdio but is only buffered, not streamed

stdio is ordered, zero-latency, and already available — it's the natural streaming channel.

## Relevant context

- Domains: [Execution](../domains/execution.md), [Adapters](../domains/adapters.md), [CLI](../domains/cli.md)
- Files/components:
  - `src/runtime/agent-runner.ts` — in-container runner; currently discards streaming messages, writes result to file, uses file-based IPC for questions
  - `src/execution/ipc.ts` — host-side file-based question polling and answer writing
  - `src/execution/docker.ts` — `spawnContainer()` currently buffers stdout/stderr, stdin is `'ignore'`
  - `src/execution/container-lifecycle.ts` — `executeRun()` orchestrates container lifecycle, question handling, and result reading
  - `src/adapters/adapter.ts` — `AgentAdapter` interface
  - `src/cli/index.ts` — `run` command handler; currently prints only final output
- ADRs: [Docker for agent isolation](../adr/docker-isolation.md)

## Scope

- Define an agent-agnostic NDJSON message protocol with typed message envelopes (thinking, tool_use, question, result, error) for stdout, and prompt/answer messages for stdin
- Modify `spawnContainer()` to pipe stdin and stream stdout line-by-line instead of buffering
- Rewrite the in-container `agent-runner.ts` to receive the prompt via a `prompt` message on stdin (instead of reading from a file), emit NDJSON messages on stdout for all `query()` events (thinking, tool use, questions, result, errors), and read answer messages from stdin
- Replace host-side file-based IPC (`ipc.ts` polling + answer writing) with stdin/stdout stream parsing and writing
- Update `executeRun()` to send the prompt as a `prompt` message on stdin after container start, process the NDJSON stdout stream, handle questions via stdin, and collect the result — exposing a streaming callback or event interface to callers
- Update the CLI `run` command to display all streamed content to the terminal (unfiltered for now)
- Remove the shared temp dir volume mount previously used for IPC and prompt file delivery — all communication now flows over stdio
- Remove file-based IPC code (`ipc.ts` polling, atomic writes, cleanup)
- Remove the output file mechanism (`result.txt`) — the result now arrives as a `result` message on stdout
- Remove the prompt file mechanism (`prompt.txt` via volume mount, `PROMPT_FILE` env var) — the prompt now arrives as a `prompt` message on stdin

## Out of scope

- Filtering or formatting of streamed output (will be addressed in a follow-up task)
- Changes to the `login` or `debug-container` commands
- Changes to the workflow engine
- Adding new agent adapters
- Changes to prompt template rendering logic (only the delivery mechanism changes)

## Acceptance criteria

- [ ] A typed message protocol is defined with distinct message types: `thinking`, `tool_use`, `question`, `result`, `error` (stdout, container→host) and `prompt`, `answer` (stdin, host→container)
- [ ] The protocol types contain no references to Claude Code, Agent SDK, or any specific agent — they are fully agent-agnostic
- [ ] `spawnContainer()` pipes stdin (`'pipe'`) and exposes stdout as a readable stream (not buffered to completion)
- [ ] The in-container runner waits for a `prompt` message on stdin before calling `query()`, replacing the prompt file read
- [ ] The in-container runner emits one NDJSON line per event from the agent SDK's `query()` iterator, covering all stdout message types listed above
- [ ] The in-container runner reads `answer` messages from stdin (instead of polling for answer files) and uses them to respond to `canUseTool` question callbacks
- [ ] The host-side `executeRun()` sends the rendered prompt as a `prompt` message on stdin after container start
- [ ] The host-side `executeRun()` parses the NDJSON stdout stream, dispatches `question` messages to the `QuestionHandler`, and writes `answer` messages to the container's stdin
- [ ] The host collects the `result` message from the stream as the run output (no more reading `result.txt` from the temp dir)
- [ ] The shared temp dir volume mount is removed (no more prompt file or IPC files delivered via volume)
- [ ] File-based IPC code is removed: `pollForQuestions()`, `writeAnswer()`, `cleanupIpcFiles()`, and associated file operations in `agent-runner.ts`
- [ ] The CLI `run` command displays all streamed messages to the terminal as they arrive
- [ ] Existing question-answering flow continues to work end-to-end (question appears in terminal, user answers, answer reaches the agent)
- [ ] Unit tests cover NDJSON message serialisation/deserialisation and stream parsing
- [ ] Integration tests cover the question→answer round-trip over stdio

## Verification checklist

- [ ] Code implemented
- [ ] Tests added/updated
- [ ] Lint/format passed
- [ ] Manual verification completed
- [ ] Docs updated if needed
