# Phase 4: Wire Git Worktree Isolation - Research

**Researched:** 2026-03-05
**Domain:** Git worktree integration into execution pipeline
**Confidence:** HIGH

## Summary

Phase 4 is a pure wiring/integration phase. The git worktree (`src/git/worktree.ts`) and branch tracker (`src/git/tracker.ts`) modules already exist and are fully tested from Phase 1 (plan 01-03). The execution pipeline (`cli/run.ts`, `workflow/runner.ts`, `executor/executor.ts`) also exists from Phases 2-3. The gap is that the pipeline never calls the git modules -- tasks currently run directly against the user-provided `repo` path without worktree isolation.

The wiring touches three layers: (1) the CLI `run.ts` and `resume.ts` commands need to create a `BranchTracker` and pass the repo path through worktree creation, (2) the workflow `runner.ts` needs to create per-node worktrees before calling the executor and clean them up after, and (3) the template-mode path in `run.ts` needs the same create/cleanup lifecycle for single-task runs.

**Primary recommendation:** Wire `createWorktree`/`removeWorktree` into `runner.ts` at the per-node execution point (line ~216), replacing `node.repo` with the worktree path. Instantiate `BranchTracker` in the CLI entry points and thread it through the call chain. Cleanup must happen in a `finally` block to handle both success and failure paths.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GIT-01 | Each concurrent task gets its own git worktree so tasks do not share filesystem state | `createWorktree()` already creates isolated worktrees at `<repo>/.worktrees/<taskId>/`. Wire it into `runner.ts` before `executor.executeTask()` so each node gets its own worktree path instead of sharing `node.repo`. |
| GIT-02 | Harness tracks which git branch each in-flight task is operating on | `BranchTracker` class already exists with `register`/`getBranch`/`getAll`/`unregister`. Instantiate in CLI commands, pass through to runner, pass to `createWorktree`/`removeWorktree` calls. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `src/git/worktree.ts` | N/A (internal) | `createWorktree()` / `removeWorktree()` | Already built and tested in Phase 1 (01-03) |
| `src/git/tracker.ts` | N/A (internal) | `BranchTracker` class | Already built and tested in Phase 1 (01-03) |

### Supporting
No new dependencies needed. This phase uses only existing internal modules.

## Architecture Patterns

### Current Execution Flow (no worktrees)

```
cli/run.ts
  -> runWorkflow(workflow, executor, { runId })
    -> runner.ts: for each node in tier
      -> renderTemplate(node.template, ...)
      -> executor.executeTask(rendered, node.repo, taskRunId)  // <-- raw repo path
```

**Problem:** `node.repo` is passed directly to the executor. All concurrent nodes sharing the same repo path will collide on the filesystem.

### Target Execution Flow (with worktrees)

```
cli/run.ts
  -> create BranchTracker(statePath)
  -> runWorkflow(workflow, executor, { runId, repoPath, tracker })
    -> runner.ts: for each node in tier
      -> createWorktree(repoPath, nodeTaskId, baseBranch, tracker)
      -> renderTemplate(node.template, ...)
      -> executor.executeTask(rendered, worktreeInfo.worktreePath, taskRunId)
      -> finally: removeWorktree(repoPath, nodeTaskId, tracker)
```

### Integration Point 1: Workflow Runner (`runner.ts`)

**What:** Wrap the per-node execution block (lines 206-249) with worktree create/cleanup.

**Key details:**
- `createWorktree(repoPath, taskId, baseBranch, tracker)` returns `WorktreeInfo` with `worktreePath`
- Pass `worktreeInfo.worktreePath` to `executor.executeTask()` instead of `node.repo`
- `removeWorktree` must be in a `finally` block -- failed tasks still need cleanup
- The `taskId` for worktree should incorporate `nodeId` to avoid collisions between concurrent nodes
- `baseBranch` should default to `"main"` or be configurable per-node/workflow

**Example:**
```typescript
// Inside the per-node execution in runner.ts
const worktreeTaskId = `${runId}-${nodeId}`;
const worktreeInfo = await createWorktree(repoPath, worktreeTaskId, baseBranch, tracker);
try {
  const rendered = await renderTemplate(node.template, node.variables ?? {}, []);
  const result = await executor.executeTask(rendered.rendered, worktreeInfo.worktreePath, uuidv4());
  // ... handle result
} finally {
  await removeWorktree(repoPath, worktreeTaskId, tracker);
}
```

### Integration Point 2: CLI `run.ts` (template mode)

**What:** Single-task template execution also needs worktree isolation.

**Key details:**
- Create worktree before `executor.executeTask()` (line 71)
- Pass `worktreeInfo.worktreePath` instead of `options.repo`
- Cleanup in `finally` block
- Template mode is simpler: one task, one worktree

### Integration Point 3: CLI `run.ts` and `resume.ts` (BranchTracker instantiation)

**What:** Create a `BranchTracker` instance and thread it through the call chain.

**Key details:**
- `BranchTracker` takes optional `statePath` for persistence
- State path should be in the same temp directory as workflow state: `<tmpdir>/agent-harness/branches/<runId>.json`
- For resume, call `tracker.load()` before resuming to restore branch state

### Integration Point 4: `runWorkflow` signature change

**What:** `RunWorkflowOptions` needs new fields for repo path and tracker.

**Current signature:**
```typescript
interface RunWorkflowOptions {
  runId?: string;
  state?: WorkflowRunState;
  workflowPath?: string;
  stateManager?: ReturnType<typeof createStateManager>;
}
```

**Needed additions:**
```typescript
interface RunWorkflowOptions {
  // ... existing fields
  repoPath?: string;         // base repo path for worktree creation
  tracker?: BranchTracker;    // branch tracking across nodes
  baseBranch?: string;        // branch to base worktrees on (default: "main")
}
```

**Design consideration:** `node.repo` currently holds the repo path per-node in the workflow YAML. For worktree mode, the runner needs the base repo path to create worktrees. Two approaches:
1. Use `node.repo` as the base repo path (simplest -- each node already declares its repo)
2. Add a top-level `repoPath` to `RunWorkflowOptions` and override per-node

**Recommendation:** Use `node.repo` directly -- it is already per-node. Each node's worktree is created from that node's repo path. This avoids changing the workflow YAML schema and handles multi-repo workflows naturally.

### Anti-Patterns to Avoid
- **Worktree cleanup in success-only path:** Always use `finally` blocks. A failed task that doesn't clean up its worktree will leave orphan branches and directories.
- **Shared taskId across concurrent nodes:** The taskId passed to `createWorktree` must be unique per concurrent execution. Using just `nodeId` without `runId` would collide across runs.
- **Branch name collision on resume:** If a resumed run tries to create a worktree for a node that already has a stale branch from the crashed run, `createWorktree` will fail (fail-fast design from Phase 1 decision). The resume path needs to handle this -- either clean up stale worktrees before resuming, or use a fresh unique ID per attempt.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Worktree creation | Custom git commands | `createWorktree()` from `src/git/worktree.ts` | Already handles branch naming, path conventions, tracker registration |
| Worktree cleanup | Manual rm + branch delete | `removeWorktree()` from `src/git/worktree.ts` | Handles force removal, prune, branch delete in correct order |
| Branch tracking | Custom Map/file tracking | `BranchTracker` from `src/git/tracker.ts` | Already has persistence, load/save, register/unregister |
| Task ID generation | Custom ID scheme | `uuid` (already a dependency) | Guaranteed unique, already used throughout codebase |

## Common Pitfalls

### Pitfall 1: Forgetting cleanup on error paths
**What goes wrong:** A task fails, the worktree is not cleaned up, orphan branches and directories accumulate.
**Why it happens:** Cleanup code placed after the `try` block instead of in `finally`.
**How to avoid:** Always use `try/finally` pattern for worktree lifecycle.
**Warning signs:** `.worktrees/` directory growing between runs; `git worktree list` showing stale entries.

### Pitfall 2: Branch collision on re-run or resume
**What goes wrong:** `createWorktree` fails with "branch already exists" because a previous run/crash left a stale branch.
**Why it happens:** Phase 1 decision: fail-fast on duplicate branches (no `--force` reuse).
**How to avoid:** Include a unique component (UUID segment or timestamp) in the taskId passed to `createWorktree`. For resume, either clean up stale worktrees first or generate new unique IDs.
**Warning signs:** `git worktree add` errors mentioning existing branch.

### Pitfall 3: `node.repo` used as worktree path after worktree creation
**What goes wrong:** Code creates a worktree but still passes `node.repo` to the executor instead of `worktreeInfo.worktreePath`.
**Why it happens:** Simple oversight when wiring -- the variable name doesn't change.
**How to avoid:** After `createWorktree`, only reference `worktreeInfo.worktreePath`. Never pass `node.repo` to executor when worktrees are enabled.
**Warning signs:** Concurrent tasks showing file conflicts; RESULT.md appearing in main repo instead of worktree.

### Pitfall 4: `removeWorktree` failing silently leaves git state dirty
**What goes wrong:** `git branch -d` fails because the branch has unmerged changes (uses `-d` not `-D`).
**Why it happens:** Agent task made commits on the branch. `-d` requires the branch to be merged into HEAD.
**How to avoid:** The existing `removeWorktree` uses `-d` (safe delete). For task branches that intentionally diverge, this will fail. May need to use `-D` (force delete) or accept that task branches persist for later review/merge. Consider whether cleanup should delete the branch at all -- the user may want to review/merge it.
**Warning signs:** `removeWorktree` throwing "branch not fully merged" errors.

### Pitfall 5: Missing `repoPath` in workflow YAML nodes
**What goes wrong:** `node.repo` is undefined or relative, causing worktree creation to fail.
**Why it happens:** Workflow YAML nodes must specify `repo` field; if missing, there's no path to create a worktree from.
**How to avoid:** Validate that `node.repo` exists and is an absolute path before attempting worktree creation. Consider resolving relative paths against the workflow file location.

## Code Examples

### Wrapping node execution with worktree lifecycle
```typescript
// In runner.ts, inside the per-node execution promise
const worktreeTaskId = `${runId.slice(0, 8)}-${nodeId}`;
const worktreeInfo = await createWorktree(node.repo, worktreeTaskId, baseBranch, tracker);
try {
  const rendered = await renderTemplate(node.template, node.variables ?? {}, []);
  const result = await executor.executeTask(
    rendered.rendered,
    worktreeInfo.worktreePath,  // NOT node.repo
    uuidv4(),
  );
  // ... handle result, update nodeStates, etc.
  return { nodeId, result };
} finally {
  try {
    await removeWorktree(node.repo, worktreeTaskId, tracker);
  } catch (cleanupErr) {
    console.warn(`[workflow] Failed to clean up worktree for node '${nodeId}': ${cleanupErr}`);
  }
}
```

### Instantiating BranchTracker in CLI
```typescript
// In cli/run.ts
import { BranchTracker } from '../git/tracker.js';
import * as os from 'os';
import * as path from 'path';

const trackerStatePath = path.join(
  os.tmpdir(), 'agent-harness', 'branches', `${runId}.json`
);
const tracker = new BranchTracker(trackerStatePath);
// For resume: await tracker.load();
```

### Template mode with worktree
```typescript
// In cli/run.ts template mode
import { createWorktree, removeWorktree } from '../git/worktree.js';

const taskId = runId.slice(0, 8);
const worktreeInfo = await createWorktree(options.repo!, taskId, 'main', tracker);
try {
  const result = await executor.executeTask(rendered.rendered, worktreeInfo.worktreePath, runId);
  // ... handle result
} finally {
  await removeWorktree(options.repo!, taskId, tracker);
}
```

## State of the Art

This is an integration phase -- no new libraries or approaches. All building blocks exist.

| Component | Status | Location |
|-----------|--------|----------|
| `createWorktree` | Built + tested | `src/git/worktree.ts` |
| `removeWorktree` | Built + tested | `src/git/worktree.ts` |
| `BranchTracker` | Built + tested | `src/git/tracker.ts` |
| `TaskExecutor` | Built + tested | `src/executor/executor.ts` |
| `runWorkflow` | Built + tested | `src/workflow/runner.ts` |
| `runCommand` | Built | `src/cli/run.ts` |
| `resumeCommand` | Built | `src/cli/resume.ts` |

## Open Questions

1. **Should `removeWorktree` delete the task branch?**
   - What we know: Current implementation uses `git branch -d` which fails on unmerged branches. Task branches will have agent commits.
   - What's unclear: Should task branches persist for user review/merge, or be force-deleted?
   - Recommendation: Keep branches alive after task completion (skip the branch delete in `removeWorktree` or use a separate cleanup command). The worktree directory can still be removed. This aligns with the project's "human merge review is intentional friction" philosophy from REQUIREMENTS.md Out of Scope.

2. **What `baseBranch` should worktrees use?**
   - What we know: `createWorktree` requires a `baseBranch` parameter. Workflow YAML nodes have `repo` but no `baseBranch` field.
   - What's unclear: Should it always be `main`? Should it be configurable per workflow or per node?
   - Recommendation: Default to `"main"`, allow optional override in `RunWorkflowOptions`. Can add per-node baseBranch to workflow YAML schema later if needed.

3. **Resume and stale worktrees**
   - What we know: If a process is killed, worktrees from the crashed run remain on disk. On resume, `createWorktree` will fail due to branch name collision.
   - What's unclear: Best cleanup strategy.
   - Recommendation: On resume, attempt `removeWorktree` for each non-completed node before re-creating. Use unique taskIds that incorporate attempt number or fresh UUID to avoid collision entirely.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.x |
| Config file | Inline in package.json (`"test": "vitest run"`) |
| Quick run command | `npx vitest run src/git/` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GIT-01 | Each concurrent task gets its own worktree (filesystem isolation) | integration | `npx vitest run src/workflow/runner.test.ts -t "worktree"` | No -- Wave 0 |
| GIT-01 | Worktree cleanup after task completion/failure | integration | `npx vitest run src/workflow/runner.test.ts -t "cleanup"` | No -- Wave 0 |
| GIT-02 | BranchTracker is instantiated and updated during execution | integration | `npx vitest run src/workflow/runner.test.ts -t "tracker"` | No -- Wave 0 |
| GIT-02 | BranchTracker getBranch returns correct branch for in-flight tasks | unit | `npx vitest run src/git/tracker.test.ts` | Yes (existing) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/git/ src/workflow/runner.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/workflow/runner.test.ts` -- needs new test cases for worktree integration (file exists but needs GIT-01/GIT-02 specific tests)
- [ ] Integration test verifying two concurrent nodes get separate worktree paths and don't share filesystem state
- [ ] Integration test verifying BranchTracker is populated during workflow execution
- [ ] Integration test verifying worktree cleanup happens even when a node fails

## Sources

### Primary (HIGH confidence)
- `src/git/worktree.ts` -- existing worktree module, read directly
- `src/git/tracker.ts` -- existing BranchTracker module, read directly
- `src/git/worktree.test.ts` -- existing tests confirming API and isolation behavior
- `src/cli/run.ts` -- current CLI entry point, read directly
- `src/workflow/runner.ts` -- current workflow runner, read directly
- `src/executor/executor.ts` -- current executor, read directly
- `src/types/index.ts` -- shared types, read directly
- `.planning/REQUIREMENTS.md` -- requirement definitions for GIT-01, GIT-02
- `.planning/STATE.md` -- project decisions and history

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all modules already built and tested; this is pure integration
- Architecture: HIGH - integration points clearly identified in existing code; straightforward wiring
- Pitfalls: HIGH - branch collision and cleanup edge cases identified from reading existing code and Phase 1 decisions

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable -- internal codebase, no external API changes expected)
