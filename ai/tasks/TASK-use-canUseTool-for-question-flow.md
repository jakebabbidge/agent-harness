# TASK: Replace hook-based question flow with canUseTool callback

## Summary

Replace the current `PreToolUse` hook-based `AskUserQuestion` interception in the in-container agent runner with the standard Agent SDK `canUseTool` callback. This aligns the implementation with the official SDK pattern for handling user input.

## Motivation

The current implementation abuses the `PreToolUse` hook mechanism: it intercepts `AskUserQuestion`, writes a question file, polls for an answer, then **denies** the tool call with the answer encoded in the denial reason string. This is a workaround — the SDK now provides a first-class `canUseTool` callback that handles this properly by returning user answers via `updatedInput` on an **allow** response. Adopting the standard pattern makes the code more maintainable, less fragile, and aligned with upstream SDK documentation.

## Reference

- Agent SDK user input docs: https://platform.claude.com/docs/en/agent-sdk/user-input.md

## Relevant context

- Domains: [Execution](../domains/execution.md), [Adapters](../domains/adapters.md)
- Files/components:
  - `src/runtime/agent-runner.ts` — in-container runtime that calls `query()` with hooks today; needs to switch to `canUseTool`
  - `src/runtime/agent-runner.test.ts` — tests for the hook-based flow; must be rewritten for `canUseTool`
  - `src/execution/ipc.ts` — file-based IPC (question/answer files); unchanged, still needed for container-host boundary
  - `src/execution/container-lifecycle.ts` — host-side question polling; unchanged
- ADRs: None directly conflicting

## Scope

- Replace `createAskUserQuestionHook` in `agent-runner.ts` with a `canUseTool` callback passed to `query()` options
- The `canUseTool` callback should detect `toolName === "AskUserQuestion"`, write the question file to the IPC dir, poll for an answer file, and return `{ behavior: "allow", updatedInput: { questions, answers } }`
- Remove the `PreToolUse` hook configuration from the `query()` call
- Remove `formatAnswerReason` helper (no longer needed — answers go through `updatedInput`, not a deny reason)
- Update `agent-runner.test.ts` to test the new `canUseTool`-based flow
- Ensure non-`AskUserQuestion` tools continue to be auto-approved (return allow with original input)

## Out of scope

- Changing the file-based IPC mechanism between container and host (still required for the Docker boundary)
- Changing the host-side polling in `container-lifecycle.ts` or `ipc.ts`
- Adding tool approval UI for non-question tools (all tools remain auto-approved in the container)
- Adding `AskUserQuestion` preview format support (`toolConfig.askUserQuestion.previewFormat`)

## Acceptance criteria

- [ ] `agent-runner.ts` passes a `canUseTool` callback to `query()` options instead of a `PreToolUse` hook
- [ ] When `toolName` is `"AskUserQuestion"`, the callback writes a question file, polls for an answer file, and returns `{ behavior: "allow", updatedInput: { questions, answers } }`
- [ ] When `toolName` is anything other than `"AskUserQuestion"`, the callback returns allow with the original input
- [ ] The `PreToolUse` hook configuration is removed from the `query()` call
- [ ] `createAskUserQuestionHook` and `formatAnswerReason` are removed
- [ ] The IPC file format (question/answer JSON files) remains unchanged so the host-side polling continues to work without modification
- [ ] `agent-runner.test.ts` tests are updated to cover the new `canUseTool` callback behavior
- [ ] Existing IPC tests in `src/execution/ipc.test.ts` (if any) continue to pass
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes

## Verification checklist

- [ ] Code implemented
- [ ] Tests added/updated
- [ ] Lint/format passed
- [ ] Manual verification completed
- [ ] Docs updated if needed
