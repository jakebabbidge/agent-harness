# Phase 6: Wire State Persistence & CLI Dry-Run - Research

**Researched:** 2026-03-05
**Domain:** CLI wiring, workflow state persistence, template dry-run
**Confidence:** HIGH

## Summary

Phase 6 closes two audit gaps: (1) workflow state is not persisted during runs because `cli/run.ts` and `cli/resume.ts` never pass a `stateManager` to `runWorkflow()`, and (2) the `dryRunRender()` function exists in `src/template/renderer.ts` but no CLI command exposes it.

Both gaps are pure wiring problems. All underlying modules are already implemented and tested: `createStateManager()` in `workflow/state.ts` handles atomic JSON persistence, `runWorkflow()` in `workflow/runner.ts` already accepts an optional `stateManager` and saves state when provided, and `dryRunRender()` in `template/renderer.ts` renders and writes to stdout. The work is connecting existing pieces through the CLI layer.

**Primary recommendation:** Wire `createStateManager()` into both `cli/run.ts` and `cli/resume.ts`, then add a `dry-run` command to `cli/index.ts` that calls `dryRunRender()`. This is a single plan with 3-4 small tasks.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WKFL-05 | Workflow state is persisted to disk; interrupted workflows can be resumed from the last completed node | `createStateManager()` exists, `runWorkflow()` accepts `stateManager` option but neither `cli/run.ts` nor `cli/resume.ts` pass it -- pure wiring gap |
| TMPL-03 | User can dry-run render a template with given variables to inspect the final prompt before execution | `dryRunRender()` exists in `template/renderer.ts` but no CLI command invokes it -- needs `dry-run` command in `cli/index.ts` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^12.0.0 | CLI command framework | Already used for all CLI commands |
| vitest | ^2.0.0 | Test framework | Project standard, native ESM |

### Supporting
No new libraries needed. All dependencies are already installed.

## Architecture Patterns

### Existing Module Topology (Relevant Files)

```
src/
├── cli/
│   ├── index.ts          # Commander program -- ADD dry-run command here
│   ├── run.ts            # runCommand() -- ADD stateManager wiring here
│   ├── resume.ts         # resumeCommand() -- ADD stateManager wiring here
│   └── answer.ts         # (no changes needed)
├── template/
│   └── renderer.ts       # dryRunRender() already exists
├── workflow/
│   ├── state.ts          # createStateManager() + saveRunState/loadRunState already exist
│   └── runner.ts         # runWorkflow() already accepts stateManager in RunWorkflowOptions
└── types/
    └── index.ts          # (no changes needed -- WorkflowRunState already defined)
```

### Pattern 1: State Manager Wiring

**What:** Import `createStateManager` (or the default `saveRunState`/`loadRunState`) and pass it to `runWorkflow()` via the `stateManager` option.

**Current code in `cli/run.ts` (line 43-48):**
```typescript
const result = await runWorkflow(workflow, executor, {
  runId,
  workflowPath: target,
  tracker,
  baseBranch: "main",
});
```

**Required change:**
```typescript
import { createStateManager } from '../workflow/state.js';

// Inside runCommand, before runWorkflow call:
const stateManager = createStateManager(
  path.join(os.tmpdir(), 'agent-harness', 'workflows')
);

const result = await runWorkflow(workflow, executor, {
  runId,
  workflowPath: target,
  tracker,
  baseBranch: "main",
  stateManager,   // <-- ADD THIS
});
```

**Note:** The default `DEFAULT_STATE_DIR` in `state.ts` is already `path.join(os.tmpdir(), 'agent-harness', 'workflows')`. Using `createStateManager()` with the same path keeps consistency with `loadRunState()` used by `cli/resume.ts`.

**Simpler alternative:** Since the default exports from `state.ts` already use the correct directory, the CLI can just import the default state manager object or use the convenience `saveRunState`/`loadRunState`. However, `runWorkflow()` expects `stateManager` as a `ReturnType<typeof createStateManager>` (an object with `saveRunState` and `loadRunState`), so either:
- Import the default manager: use `createStateManager(DEFAULT_STATE_DIR)` or
- Create a wrapper from the default exports

The cleanest approach: just call `createStateManager()` with the same default path constant.

### Pattern 2: Resume State Manager Wiring

**What:** `cli/resume.ts` also calls `runWorkflow()` without a `stateManager`. Same fix needed.

**Current code in `cli/resume.ts` (line 65-71):**
```typescript
const result = await runWorkflow(state.workflowDef, executor, {
  runId,
  state,
  workflowPath: state.workflowPath,
  tracker,
  baseBranch: 'main',
});
```

**Required change:** Add `stateManager` to the options object, using the same directory as the default `loadRunState`.

### Pattern 3: Dry-Run CLI Command

**What:** Add a `dry-run` command to `cli/index.ts` that calls `dryRunRender()`.

**The `dryRunRender()` function already exists (renderer.ts lines 62-70):**
```typescript
export async function dryRunRender(
  templatePath: string,
  variables: TemplateVariables,
  partialPaths: string[],
): Promise<RenderResult> {
  const result = await renderTemplate(templatePath, variables, partialPaths);
  process.stdout.write(result.rendered + '\n');
  return result;
}
```

**CLI command to add in `cli/index.ts`:**
```typescript
program
  .command('dry-run')
  .description('Render a template and print the result without executing')
  .argument('<template>', 'Template file path')
  .option('-v, --variables <json>', 'JSON variables for template', '{}')
  .option('-p, --partials <paths...>', 'Partial template file paths')
  .action(async (template: string, opts: { variables?: string; partials?: string[] }) => {
    await dryRunCommand(template, opts);
  });
```

**Implementation can be inline or in a separate `cli/dry-run.ts` file.** Given project conventions (each command has its own file: `run.ts`, `resume.ts`, `answer.ts`), a separate `cli/dry-run.ts` file is preferred.

### Anti-Patterns to Avoid

- **Do not create a new state manager with a different directory:** The default state directory `$TMPDIR/agent-harness/workflows` must be the same in both `run.ts` and `resume.ts`. Otherwise `loadRunState()` in `resume.ts` cannot find state saved by `run.ts`.
- **Do not add execution logic to the dry-run command:** The entire point of dry-run is to render without executing. No Docker, no git, no agent SDK.
- **Do not duplicate the default state directory path:** Import or derive it from `state.ts` rather than hardcoding in multiple places.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State persistence | Custom file format | Existing `createStateManager()` | Already implemented with atomic write (tmp+rename) and async mutex |
| Template rendering | Manual Handlebars setup | Existing `dryRunRender()` | Already handles partials, isolated Handlebars instances |
| CLI argument parsing | Manual argv parsing | Commander (already in use) | Consistent with existing commands |

## Common Pitfalls

### Pitfall 1: State Directory Mismatch
**What goes wrong:** `run.ts` saves state to one directory, `resume.ts` looks in another.
**Why it happens:** Both files hardcode separate path strings instead of sharing a constant.
**How to avoid:** Use the same `DEFAULT_STATE_DIR` constant from `state.ts` or call `createStateManager()` with the same path. Better yet, export the default state manager instance and import it.
**Warning signs:** `resume` command says "No workflow state found" even though `run` just completed.

### Pitfall 2: Forgetting stateManager in Resume Path
**What goes wrong:** `run.ts` gets the stateManager but `resume.ts` does not. Resumed runs don't persist updated state, so a second crash loses progress.
**Why it happens:** The two CLI entry points are modified independently.
**How to avoid:** Wire stateManager in both `run.ts` AND `resume.ts` in the same task.

### Pitfall 3: Variables Parsing in Dry-Run
**What goes wrong:** User passes `--vars '{"key":"value"}'` but it fails to parse.
**Why it happens:** Different flag name than existing `run` command, or missing JSON parse error handling.
**How to avoid:** Follow the exact same pattern as `run.ts` lines 70-81 for parsing variables JSON. Use the same flag name (`--variables` or `-v`) for consistency.

### Pitfall 4: Partials Not Exposed in Dry-Run
**What goes wrong:** Dry-run renders a template that uses `{{> partial}}` but the CLI doesn't accept partial paths.
**Why it happens:** `dryRunRender()` accepts `partialPaths` but the CLI command doesn't expose a `--partials` flag.
**How to avoid:** Add a `--partials` option to the dry-run command that accepts one or more file paths.

## Code Examples

### Wire stateManager into run.ts
```typescript
// At top of cli/run.ts, add import:
import { createStateManager } from '../workflow/state.js';

// Inside runCommand, in the workflow branch (around line 42):
const stateDir = path.join(os.tmpdir(), 'agent-harness', 'workflows');
const stateManager = createStateManager(stateDir);

const result = await runWorkflow(workflow, executor, {
  runId,
  workflowPath: target,
  tracker,
  baseBranch: "main",
  stateManager,
});
```

### Wire stateManager into resume.ts
```typescript
// At top of cli/resume.ts, add import:
import { createStateManager } from '../workflow/state.js';

// Inside resumeCommand, before runWorkflow call:
const stateDir = path.join(os.tmpdir(), 'agent-harness', 'workflows');
const stateManager = createStateManager(stateDir);

const result = await runWorkflow(state.workflowDef, executor, {
  runId,
  state,
  workflowPath: state.workflowPath,
  tracker,
  baseBranch: 'main',
  stateManager,
});
```

### Dry-run command (cli/dry-run.ts)
```typescript
import { dryRunRender } from '../template/renderer.js';

export async function dryRunCommand(
  template: string,
  options: { variables?: string; partials?: string[] },
): Promise<void> {
  let variables: Record<string, unknown> = {};
  try {
    variables = JSON.parse(options.variables ?? '{}') as Record<string, unknown>;
  } catch {
    console.error('[agent-harness] Error: --variables must be a valid JSON string.');
    process.exit(1);
  }

  const partialPaths = options.partials ?? [];
  await dryRunRender(template, variables, partialPaths);
}
```

### Register dry-run in cli/index.ts
```typescript
import { dryRunCommand } from './dry-run.js';

program
  .command('dry-run')
  .description('Render a template with variables and print the result (no execution)')
  .argument('<template>', 'Template file path')
  .option('-v, --variables <json>', 'JSON variables for template', '{}')
  .option('-p, --partials <paths...>', 'Partial template file paths')
  .action(async (template: string, opts: { variables?: string; partials?: string[] }) => {
    await dryRunCommand(template, opts);
  });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No state persistence during run | stateManager wired into runner | Phase 3 (module), Phase 6 (wiring) | Resume actually works end-to-end |
| No CLI dry-run | dry-run command exposed | Phase 1 (function), Phase 6 (CLI) | Users can inspect prompts before execution |

## Open Questions

1. **State directory path sharing**
   - What we know: Both `state.ts` default and `cli/resume.ts` use `$TMPDIR/agent-harness/workflows`. The `run.ts` and `resume.ts` need to use the same path.
   - What's unclear: Whether to export the constant from `state.ts` or just hardcode the same path.
   - Recommendation: Export `DEFAULT_STATE_DIR` from `state.ts` so both CLI files can import it. This prevents drift.

2. **Template-mode state persistence**
   - What we know: Template mode (non-workflow) in `run.ts` does not go through `runWorkflow()` at all. There is no state to persist for single template runs.
   - What's unclear: Nothing -- this is correctly scoped to workflow mode only.
   - Recommendation: Only wire stateManager in the workflow branch of `run.ts`, not the template branch.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.x |
| Config file | Implicit (vitest detects via package.json) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WKFL-05 | stateManager passed to runWorkflow in run.ts | unit | `npx vitest run src/workflow/runner.test.ts -x` | Yes (runner tests exist, but need new test verifying state is saved when stateManager is provided via CLI path) |
| WKFL-05 | resume loads and re-persists state | unit | `npx vitest run src/workflow/runner.test.ts -x` | Yes (resume tests exist) |
| TMPL-03 | dry-run CLI command renders template to stdout | unit | `npx vitest run src/cli/dry-run.test.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/cli/dry-run.test.ts` -- covers TMPL-03 dry-run CLI command
- [ ] Verify existing `runner.test.ts` already covers state persistence (it does -- tests pass stateManager and verify state is saved)

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `src/cli/run.ts`, `src/cli/resume.ts`, `src/cli/index.ts`, `src/workflow/runner.ts`, `src/workflow/state.ts`, `src/template/renderer.ts`
- Direct code inspection of `src/types/index.ts` for type definitions
- Direct code inspection of `src/workflow/runner.test.ts` and `src/workflow/state.test.ts` for existing test coverage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing code
- Architecture: HIGH - pure wiring of existing modules, patterns are established
- Pitfalls: HIGH - gaps are well-understood from code analysis

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable -- no external dependencies changing)
