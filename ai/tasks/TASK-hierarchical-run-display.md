# TASK: Hierarchical Run Display with Ink

## Summary

Overhaul the `run` CLI command's terminal output to use a hierarchical, Ink-based UI. The top level shows a real-time status dashboard of all executions. The second level allows the user to drill into a specific execution to view agent history and answer questions.

## Motivation

The current `run` command streams agent output linearly to stderr using raw ANSI codes. This works for a single execution but does not scale to the near-future workflow model where multiple executions run in parallel or sequence. A hierarchical display gives the user a real-time overview of all execution states and the ability to focus on a single execution when intervention (e.g. answering questions) is needed. Building this on Ink (React for the terminal) provides a component-based, extensible foundation for future UI complexity.

## Relevant context

- Domains: [CLI](/ai/domains/cli.md), [Execution](/ai/domains/execution.md), [Workflows](/ai/domains/workflows.md)
- Files/components:
  - `src/cli/index.ts` — run command definition, `handleStreamMessage()`, command handler
  - `src/cli/prompt.ts` — `promptUserForAnswer()` interactive question UI
  - `src/messages.ts` — `OutboundMessage`, `QuestionMessage`, `AnswerMessage` types
  - `src/execution/container-lifecycle.ts` — `executeRun()` interface (message and question callbacks)
- ADRs: None directly conflicting. [Declarative YAML workflows](/ai/adr/declarative-yaml-workflows.md) is relevant context for why the UI must support multiple executions.

## Scope

### Runtime / UI separation

- Introduce a **runtime layer** (`src/runtime/` or `src/run-session/`) that owns the lifecycle and state of a run session — it manages executions, aggregates messages, tracks statuses, and exposes a question-answering interface
- The runtime layer must be **purely programmatic** with no terminal/UI dependencies — it should be usable as a headless SDK (e.g. for a future web UI, API server, or test harness) without importing Ink or React
- The runtime exposes execution state via an observable interface (e.g. EventEmitter, callbacks, or a reactive store) that any consumer can subscribe to
- The Ink UI is a **thin rendering layer** that subscribes to runtime state and dispatches user actions (navigation, answering questions) back to the runtime — it contains zero business logic

### Ink UI layer

- Add `ink` and `ink-*` as dependencies (and `react` as a peer dependency as required by Ink)
- Create an Ink-based component tree for the run command's terminal UI
- **Top-level view (execution dashboard)**:
  - Renders a list of all current executions
  - Each execution row shows: name/identifier, status icon (spinner for in-progress, question mark for blocked-on-question, checkmark for completed, cross for failed)
  - Status updates in real time as the runtime emits state changes
  - User can navigate between executions (e.g. arrow keys) when multiple exist
- **Second-level view (execution detail)**:
  - User selects an execution from the dashboard to drill in
  - Shows the agent's message history for that execution (thinking, text, tool use messages)
  - This is where `QuestionMessage` prompts are displayed and the user provides answers
  - User can navigate back to the top-level dashboard
- Replace `handleStreamMessage()` and `promptUserForAnswer()` with Ink components that read from runtime state
- Design the component architecture to be extensible: execution list, execution detail, and question answering should be separate, composable components

### Integration

- The CLI `run` command handler creates a runtime session, then passes it to the Ink renderer
- Maintain the existing `executeRun()` interface contract — the execution engine should not need changes
- For now, the `run` command still accepts a single template (one execution), but both the runtime and UI must be structured to support multiple executions without further architectural changes

## Out of scope

- Workflow command or multi-execution orchestration (future task)
- Changes to the execution engine, IPC protocol, or message types
- Changes to the `dry-run` or `login` commands
- Publishing the runtime as a separate package (it lives in-repo for now; extraction is a future concern)
- Persistent execution history or log files
- Mouse interaction
- Themeable styling or user-configurable colors

## Acceptance criteria

### Runtime / UI separation

- [ ] A runtime layer exists that manages run session state (execution statuses, message histories, pending questions) with no dependency on Ink, React, or any terminal UI library
- [ ] The runtime exposes an observable interface (e.g. EventEmitter or callbacks) that consumers subscribe to for state changes
- [ ] The runtime exposes a programmatic method for answering questions (not tied to any UI)
- [ ] The Ink UI layer imports from the runtime but the runtime never imports from the UI — the dependency is strictly one-directional
- [ ] The runtime can be instantiated and driven entirely from a test without rendering any UI

### Ink UI

- [ ] `pnpm run` command renders an Ink-based terminal UI instead of raw stderr writes
- [ ] Top-level view displays a list of executions with a real-time status indicator per execution (spinner while running, question-mark icon when blocked on a question, checkmark on success, cross on failure)
- [ ] User can navigate from the top-level view into an execution's detail view and back (e.g. Enter to drill in, Escape or `q` to go back)
- [ ] Execution detail view displays the streamed agent messages (thinking, text, tool use) in a scrollable or streaming fashion
- [ ] When a `QuestionMessage` arrives, the execution's status icon changes to indicate it is blocked, and the detail view presents the question with the appropriate input type (single select, multi select, or free text)
- [ ] User can answer questions in the detail view; the answer is sent back through the runtime's programmatic answer interface
- [ ] After answering a question, the execution's status icon returns to the in-progress indicator
- [ ] The UI component tree is structured as independent, composable components (e.g. `ExecutionList`, `ExecutionDetail`, `QuestionPrompt`) rather than a monolithic render function
- [ ] The component architecture supports rendering multiple concurrent executions without structural changes — adding a second execution to the list should require only data changes, not component changes
- [ ] All existing question types (single select, multi select, free text) are supported in the new UI

### Integration and quality

- [ ] The `executeRun()` function signature and the execution engine are not modified
- [ ] Existing tests in `src/cli/index.test.ts` are updated or replaced to cover the new behavior
- [ ] Runtime layer has unit tests that exercise state transitions and question answering without any UI
- [ ] `pnpm lint && pnpm format` passes
- [ ] `pnpm test` passes

## Verification checklist

- [ ] Code implemented
- [ ] Tests added/updated
- [ ] Lint/format passed
- [ ] Manual verification completed
- [ ] Docs updated if needed
