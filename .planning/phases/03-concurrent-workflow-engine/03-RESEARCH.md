# Phase 3: Concurrent Workflow Engine - Research

**Researched:** 2026-03-05
**Domain:** DAG execution engine, workflow state persistence, conditional routing
**Confidence:** HIGH

## Summary

Phase 3 transforms the sequential workflow runner into a concurrent DAG executor with conditional edge routing and crash-resilient state persistence. The existing codebase provides a solid foundation: `runner.ts` iterates nodes linearly, `parser.ts` validates workflow YAML with Zod, and `worktree.ts` / `manager.ts` already handle per-task isolation (git worktrees + Docker containers). The three requirements (WKFL-03, WKFL-04, WKFL-05) are complementary -- concurrent execution needs state tracking (for resumability), and conditional edges affect which nodes get scheduled (affecting the DAG traversal).

The core engineering challenge is replacing the `for` loop in `runner.ts` with a topological-sort-based DAG scheduler that: (1) computes which nodes have all dependencies satisfied, (2) launches independent nodes concurrently via `Promise.all` or a concurrency pool, (3) records per-node completion status to a JSON file on disk, and (4) evaluates edge conditions against upstream node output before scheduling downstream nodes.

**Primary recommendation:** Build a pure-TypeScript DAG scheduler with no external workflow library -- the problem is well-scoped (tens of nodes, not thousands), the existing Zod-validated workflow definition already has nodes and edges, and adding a workflow engine dependency (like `bullmq`, `temporal`, `p-graph`) would be overkill and add operational complexity.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WKFL-03 | Workflow engine executes independent nodes in parallel (fan-out concurrent execution) | DAG scheduler pattern: topological sort + readiness check + Promise.all for concurrent tier. Each node gets its own worktree (existing `createWorktree`) and container (existing `createContainer`). |
| WKFL-04 | Workflow edges can define conditions based on node output to route to different next nodes | Extend EdgeDef schema with optional `condition` field. Condition evaluator checks `resultText` (from RESULT.md) against simple expressions (e.g., field matching). |
| WKFL-05 | Workflow state is persisted to disk; interrupted workflows can be resumed from the last completed node | JSON state file per workflow run, written after each node completes. Resume command loads state, skips completed nodes, re-enters DAG scheduler. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fs/promises` | N/A | State persistence (JSON files) | Already used throughout codebase; no need for database |
| `zod` | ^3.0.0 | Schema validation for extended workflow YAML | Already in use for workflow parsing |
| `uuid` | ^13.0.0 | Run IDs for workflow runs | Already in use |
| `yaml` | ^2.8.2 | Workflow YAML parsing | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^2.0.0 | Unit tests for DAG scheduler, condition evaluator | All test files |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom DAG scheduler | `p-graph` npm package | p-graph is minimal but adds a dependency for ~100 lines of custom code; custom is preferable given the small scale |
| JSON file persistence | SQLite / LevelDB | Database adds operational complexity; JSON files are sufficient for single-machine workflow state |
| Custom condition eval | `jsonata` / `jexl` expression engine | Expression engine is overkill; simple field-path matching covers the stated requirement |

**Installation:**
```bash
# No new dependencies needed -- all libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── workflow/
│   ├── parser.ts          # MODIFY: extend EdgeDef with condition field
│   ├── parser.test.ts     # MODIFY: add conditional edge parse tests
│   ├── runner.ts          # REPLACE: sequential -> DAG scheduler
│   ├── runner.test.ts     # REPLACE: concurrent execution tests
│   ├── dag.ts             # NEW: topological sort, readiness computation
│   ├── dag.test.ts        # NEW: DAG algorithm unit tests
│   ├── condition.ts       # NEW: edge condition evaluator
│   ├── condition.test.ts  # NEW: condition evaluator tests
│   ├── state.ts           # NEW: workflow run state persistence
│   └── state.test.ts      # NEW: state persistence tests
├── cli/
│   ├── index.ts           # MODIFY: add `resume` command
│   └── run.ts             # MODIFY: pass worktree/container deps to runner
├── types/
│   └── index.ts           # MODIFY: add new types
└── ...existing...
```

### Pattern 1: DAG Scheduler with Tier-Based Execution
**What:** Nodes are grouped into execution tiers by topological sort. All nodes in a tier can run concurrently. A tier completes when all its nodes finish. Then the next tier's ready nodes are scheduled.
**When to use:** When the DAG is small (tens of nodes) and you want deterministic scheduling without a job queue.
**Example:**
```typescript
// Topological sort produces tiers:
// Tier 0: [A, B]     -- no dependencies, run concurrently
// Tier 1: [C]         -- depends on A and B, waits for tier 0
// Tier 2: [D, E]     -- D depends on C, E depends on C

interface DagNode {
  id: string;
  inDegree: number;
  dependsOn: string[];   // upstream node IDs
  dependedBy: string[];  // downstream node IDs
}

function computeReadyNodes(
  dag: Map<string, DagNode>,
  completed: Set<string>,
): string[] {
  const ready: string[] = [];
  for (const [id, node] of dag) {
    if (completed.has(id)) continue;
    if (node.dependsOn.every((dep) => completed.has(dep))) {
      ready.push(id);
    }
  }
  return ready;
}
```

### Pattern 2: Per-Node Isolation (Worktree + Container)
**What:** Each concurrent node gets its own git worktree and Docker container, ensuring complete filesystem isolation.
**When to use:** Always -- this is required by the project's core value and existing architecture (GIT-01, CONT-01).
**Example:**
```typescript
async function executeNode(
  node: NodeDef,
  runId: string,
  executor: TaskExecutor,
): Promise<{ nodeId: string; result: TaskResult }> {
  // Each node already uses its own worktree path (node.repo)
  // The runner must create a worktree per node for concurrent execution
  const worktree = await createWorktree(node.repo, nodeRunId, 'main');
  try {
    const rendered = await renderTemplate(node.template, node.variables ?? {}, []);
    const result = await executor.executeTask(rendered.rendered, worktree.worktreePath, nodeRunId);
    return { nodeId: node.id, result };
  } finally {
    await removeWorktree(node.repo, nodeRunId);
  }
}
```

### Pattern 3: Conditional Edge Evaluation
**What:** Edges can have an optional `condition` object. After a node completes, its outgoing edges are evaluated. Only edges whose conditions match the upstream node's output are activated.
**When to use:** WKFL-04 -- routing based on node output.
**Example:**
```yaml
# Workflow YAML with conditional edges
edges:
  - from: review
    to: fix-bugs
    condition:
      field: status        # field name in RESULT.md parsed output
      equals: "needs_fixes"
  - from: review
    to: merge
    condition:
      field: status
      equals: "approved"
```

```typescript
interface EdgeCondition {
  field: string;
  equals?: string;
  notEquals?: string;
  contains?: string;
}

function evaluateCondition(
  condition: EdgeCondition | undefined,
  nodeOutput: Record<string, unknown>,
): boolean {
  if (!condition) return true; // unconditional edge
  const value = String(nodeOutput[condition.field] ?? '');
  if (condition.equals !== undefined) return value === condition.equals;
  if (condition.notEquals !== undefined) return value !== condition.notEquals;
  if (condition.contains !== undefined) return value.includes(condition.contains);
  return true;
}
```

### Pattern 4: Persistent Workflow State
**What:** A JSON file tracks the run state: which nodes completed, which failed, their outputs, and the workflow definition. On resume, the scheduler loads this state and skips completed nodes.
**When to use:** WKFL-05 -- crash recovery and resume.
**Example:**
```typescript
interface WorkflowRunState {
  runId: string;
  workflowPath: string;
  workflowDef: WorkflowDef;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  startedAt: string;
  completedAt?: string;
  nodeStates: Record<string, {
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    result?: TaskResult;
    startedAt?: string;
    completedAt?: string;
  }>;
}

// State file location
const stateDir = path.join(os.tmpdir(), 'agent-harness', 'workflows');
const statePath = path.join(stateDir, `${runId}.json`);
```

### Anti-Patterns to Avoid
- **Shared worktree across concurrent nodes:** Each node MUST have its own worktree. Sharing a worktree between concurrent nodes causes git conflicts and data corruption.
- **In-memory-only state:** If the process crashes, all progress is lost. Always persist state to disk after each node completion.
- **Complex expression languages for conditions:** Keep conditions simple (field equality/containment). If users need complex logic, they should use separate workflow nodes.
- **Launching all nodes at once without DAG ordering:** Even with concurrency, downstream nodes must wait for upstream completion. A tier-based or event-driven scheduler enforces this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Topological sort | Ad-hoc DFS with visited flags | Kahn's algorithm (BFS with in-degree tracking) | Kahn's detects cycles naturally (remaining nodes = cycle), is iterative not recursive, and produces tier groupings directly |
| Concurrent promise management | Manual Promise tracking | `Promise.allSettled()` for concurrent tier execution | allSettled never short-circuits -- you get results for all nodes even if some fail, which is needed for state tracking |
| YAML parsing | Custom parser | `yaml` package (already installed) | Battle-tested, handles edge cases |
| Schema validation | Manual field checks | `zod` (already installed) | Type inference + runtime validation in one |

**Key insight:** The DAG scheduler is the only genuinely custom code needed. Everything else (parsing, validation, isolation, execution) is already built. The scheduler itself is ~100-150 lines of well-understood algorithm (Kahn's BFS).

## Common Pitfalls

### Pitfall 1: Race Condition in State Persistence
**What goes wrong:** Two concurrent nodes complete at the same time, both read the state file, both write -- one's update is lost.
**Why it happens:** Concurrent writes to the same JSON file without coordination.
**How to avoid:** Use a mutex/lock around state writes, or use an append-only log pattern. Simplest: have a single scheduler loop that receives completion events and writes state sequentially.
**Warning signs:** Intermittent "node already completed" errors or lost node results on resume.

### Pitfall 2: Worktree Cleanup on Failure
**What goes wrong:** A node fails or the process crashes, leaving orphaned git worktrees that prevent re-runs (branch already exists error).
**Why it happens:** `createWorktree` creates a branch, and if `removeWorktree` is never called, the branch persists.
**How to avoid:** On resume, check for and clean up stale worktrees before re-running nodes. Use try/finally for normal execution flow.
**Warning signs:** "fatal: A branch named 'agent-harness/task-...' already exists" on re-run.

### Pitfall 3: Circular Dependency in DAG
**What goes wrong:** User creates a cycle in the workflow edges (A->B->C->A). Scheduler hangs or recurses infinitely.
**Why it happens:** No cycle detection in the parser.
**How to avoid:** Kahn's algorithm naturally detects cycles -- if after processing, some nodes have non-zero in-degree, there's a cycle. Fail fast with a clear error message.
**Warning signs:** Workflow hangs with "waiting for upstream nodes" that never complete.

### Pitfall 4: Node Output Parsing for Conditions
**What goes wrong:** Condition evaluation fails because RESULT.md content isn't structured as expected (no JSON, wrong field names).
**Why it happens:** RESULT.md is free-form markdown; conditions expect structured data.
**How to avoid:** Define a convention: conditions evaluate against a JSON block in RESULT.md (e.g., a YAML frontmatter section or a ```json code block). If no structured data is found, condition evaluation returns false (edge not taken) with a warning.
**Warning signs:** Conditional edges never activate, or always activate regardless of output.

### Pitfall 5: Resume After Partial Concurrent Tier
**What goes wrong:** Process crashes while 3 of 5 concurrent nodes are running. On resume, you don't know if the "running" nodes actually completed (they might have finished but state wasn't persisted).
**Why it happens:** State is written as "running" before execution, "completed" after -- crash between means ambiguous state.
**How to avoid:** Mark nodes as "running" in state, but on resume treat "running" as "pending" (needs re-run). This is safe because each node runs in its own worktree -- re-running is idempotent from the perspective of the main repo.
**Warning signs:** Duplicate work on resume, or skipping nodes that didn't actually complete.

## Code Examples

### Extended EdgeDef Schema (Zod)
```typescript
// Source: Extending existing parser.ts pattern
export const EdgeConditionSchema = z.object({
  field: z.string(),
  equals: z.string().optional(),
  notEquals: z.string().optional(),
  contains: z.string().optional(),
}).refine(
  (c) => c.equals !== undefined || c.notEquals !== undefined || c.contains !== undefined,
  { message: 'Condition must have at least one of: equals, notEquals, contains' },
);

export const EdgeDefSchema = z.object({
  from: z.string(),
  to: z.string(),
  condition: EdgeConditionSchema.optional(),
});
```

### Kahn's Algorithm for Topological Tiers
```typescript
function topologicalTiers(nodes: string[], edges: Array<{ from: string; to: string }>): string[][] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n, 0);
    adj.set(n, []);
  }
  for (const e of edges) {
    adj.get(e.from)!.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const tiers: string[][] = [];
  let queue = nodes.filter((n) => inDegree.get(n) === 0);

  while (queue.length > 0) {
    tiers.push([...queue]);
    const nextQueue: string[] = [];
    for (const n of queue) {
      for (const neighbor of adj.get(n)!) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) nextQueue.push(neighbor);
      }
    }
    queue = nextQueue;
  }

  // Cycle detection
  const scheduled = tiers.flat().length;
  if (scheduled !== nodes.length) {
    const unscheduled = nodes.filter((n) => !tiers.flat().includes(n));
    throw new Error(`Workflow has circular dependencies involving nodes: ${unscheduled.join(', ')}`);
  }

  return tiers;
}
```

### Workflow State Persistence
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const STATE_DIR = path.join(os.tmpdir(), 'agent-harness', 'workflows');

async function saveRunState(state: WorkflowRunState): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const filePath = path.join(STATE_DIR, `${state.runId}.json`);
  // Atomic write: write to temp file then rename
  const tmpPath = filePath + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2));
  await fs.rename(tmpPath, filePath);
}

async function loadRunState(runId: string): Promise<WorkflowRunState | null> {
  const filePath = path.join(STATE_DIR, `${runId}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as WorkflowRunState;
  } catch {
    return null;
  }
}
```

### DAG Runner with Concurrency and Conditions
```typescript
async function runDag(
  workflow: WorkflowDef,
  executor: TaskExecutor,
  state: WorkflowRunState,
  saveState: (s: WorkflowRunState) => Promise<void>,
): Promise<WorkflowResult> {
  const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]));
  const completed = new Set(
    Object.entries(state.nodeStates)
      .filter(([, s]) => s.status === 'completed')
      .map(([id]) => id),
  );

  while (true) {
    // Find ready nodes: all dependencies completed, not yet completed
    const ready = computeReadyNodes(workflow, completed, state);
    if (ready.length === 0) break;

    // Execute ready nodes concurrently
    const results = await Promise.allSettled(
      ready.map(async (nodeId) => {
        state.nodeStates[nodeId] = { status: 'running', startedAt: new Date().toISOString() };
        await saveState(state);

        const node = nodeMap.get(nodeId)!;
        const result = await executeNode(node, state.runId, executor);
        return { nodeId, result };
      }),
    );

    // Process results
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { nodeId, result } = r.value;
        state.nodeStates[nodeId] = {
          status: result.result.exitCode === 0 ? 'completed' : 'failed',
          result: result.result,
          completedAt: new Date().toISOString(),
        };
        if (result.result.exitCode === 0) completed.add(nodeId);
      } else {
        // Handle rejection -- mark as failed
      }
    }
    await saveState(state);
  }

  // ... determine overall status
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sequential for-loop execution | DAG-based concurrent scheduler | Phase 3 (this phase) | Enables parallel node execution |
| Unconditional edges only | Conditional edge routing | Phase 3 (this phase) | Enables branching workflows |
| No state persistence | JSON file per workflow run | Phase 3 (this phase) | Enables crash recovery |

**Deprecated/outdated:**
- The current `runWorkflow()` function in `runner.ts` will be replaced entirely. The sequential iteration pattern is incompatible with concurrent execution and must be replaced with the DAG scheduler.

## Open Questions

1. **Node output format for condition evaluation**
   - What we know: Nodes write RESULT.md as structured output. Conditions need to evaluate fields from this output.
   - What's unclear: Should RESULT.md contain a JSON frontmatter block, or should we parse the entire markdown for a structured section?
   - Recommendation: Require a JSON code block in RESULT.md (```json ... ```) that the condition evaluator extracts and parses. Simple, explicit, and doesn't change the RESULT.md convention significantly. Alternatively, parse the entire resultText as JSON first, falling back to treating it as a plain string for simple `contains` checks.

2. **Concurrency limit**
   - What we know: Each concurrent node spawns a Docker container and git worktree. System resources are finite.
   - What's unclear: Should there be a maximum concurrency limit?
   - Recommendation: Default to unbounded (all ready nodes run), but accept an optional `--concurrency N` CLI flag. For v1 with small workflows, unbounded is fine.

3. **Resume command scope**
   - What we know: Success criteria says `agent-harness resume <run-id>`. CLI currently has `run` and `answer` commands.
   - What's unclear: Should `resume` be a subcommand of `run` or a top-level command?
   - Recommendation: Top-level `resume` command -- cleaner UX, matches the success criteria literally.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.x |
| Config file | none -- vitest uses default config via package.json `scripts.test` |
| Quick run command | `npx vitest run src/workflow/` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WKFL-03 | Fan-out: two independent nodes execute concurrently | unit | `npx vitest run src/workflow/runner.test.ts -t "concurrent"` | No -- Wave 0 |
| WKFL-03 | Each concurrent node gets separate worktree | unit | `npx vitest run src/workflow/runner.test.ts -t "worktree"` | No -- Wave 0 |
| WKFL-04 | Conditional edge routes based on node output field | unit | `npx vitest run src/workflow/condition.test.ts` | No -- Wave 0 |
| WKFL-04 | Unconditional edges always activate | unit | `npx vitest run src/workflow/condition.test.ts -t "unconditional"` | No -- Wave 0 |
| WKFL-05 | State persisted after each node completion | unit | `npx vitest run src/workflow/state.test.ts` | No -- Wave 0 |
| WKFL-05 | Resume skips completed nodes | unit | `npx vitest run src/workflow/runner.test.ts -t "resume"` | No -- Wave 0 |
| WKFL-05 | Resume CLI command loads state and continues | unit | `npx vitest run src/workflow/runner.test.ts -t "resume"` | No -- Wave 0 |
| DAG | Topological sort produces correct tiers | unit | `npx vitest run src/workflow/dag.test.ts` | No -- Wave 0 |
| DAG | Cycle detection throws error | unit | `npx vitest run src/workflow/dag.test.ts -t "cycle"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/workflow/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/workflow/dag.test.ts` -- covers topological sort and cycle detection
- [ ] `src/workflow/condition.test.ts` -- covers edge condition evaluation
- [ ] `src/workflow/state.test.ts` -- covers state persistence and loading
- [ ] Updated `src/workflow/runner.test.ts` -- covers concurrent execution and resume

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/workflow/runner.ts`, `src/workflow/parser.ts`, `src/executor/executor.ts`, `src/git/worktree.ts`, `src/container/manager.ts`, `src/types/index.ts`
- Existing test suite: 73 tests passing across 8 test files
- Node.js `fs/promises` API: atomic write via rename is a standard pattern for crash-safe file updates

### Secondary (MEDIUM confidence)
- Kahn's algorithm for topological sort: well-established CS algorithm, O(V+E) complexity, naturally detects cycles
- `Promise.allSettled()`: ES2020 standard, available in Node.js 12.9+, used in project target ES2022

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies needed, all existing libraries sufficient
- Architecture: HIGH -- DAG scheduling is a well-understood pattern; codebase structure is clear
- Pitfalls: HIGH -- common concurrency and state persistence issues are well-documented in engineering literature

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable -- no fast-moving dependencies)
