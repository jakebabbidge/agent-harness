import { v4 as uuidv4 } from 'uuid';
import { renderTemplate } from '../template/renderer.js';
import { TaskExecutor } from '../executor/executor.js';
import { topologicalTiers } from './dag.js';
import { evaluateCondition } from './condition.js';
import { createStateManager } from './state.js';
import { createWorktree, removeWorktree } from '../git/worktree.js';
import type { BranchTracker } from '../git/tracker.js';
import type {
  WorkflowDef,
  TaskResult,
  WorkflowRunState,
  NodeRunState,
  EdgeDef,
} from '../types/index.js';

/**
 * The aggregated result of running a complete workflow.
 */
export interface WorkflowResult {
  status: 'success' | 'failed';
  nodeResults: Array<{ nodeId: string; result: TaskResult }>;
  failedNodeId?: string;
  skippedNodeIds?: string[];
}

/** Options for runWorkflow -- all fields optional for backward compatibility. */
export interface RunWorkflowOptions {
  runId?: string;
  state?: WorkflowRunState;
  workflowPath?: string;
  stateManager?: ReturnType<typeof createStateManager>;
  tracker?: BranchTracker;    // branch tracking across nodes
  baseBranch?: string;        // branch to base worktrees on (default: "main")
}

/**
 * Parse a node's resultText as JSON for condition evaluation.
 * If parsing fails, wraps the raw text under key "raw".
 */
function parseNodeOutput(resultText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(resultText);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { raw: resultText };
  } catch {
    return { raw: resultText };
  }
}

/**
 * Determine whether all incoming edges to a node are satisfied.
 * Returns 'ready' if the node can execute, 'waiting' if upstream is
 * still pending, or 'skip' if all upstream paths are dead.
 */
function evaluateIncomingEdges(
  nodeId: string,
  edges: EdgeDef[],
  nodeStates: Record<string, NodeRunState>,
  nodeOutputs: Map<string, Record<string, unknown>>,
): 'ready' | 'waiting' | 'skip' {
  const incoming = edges.filter((e) => e.to === nodeId);
  if (incoming.length === 0) return 'ready'; // root node

  let anyActive = false;
  let allUpstreamDone = true;

  for (const edge of incoming) {
    const srcState = nodeStates[edge.from];
    if (!srcState || srcState.status === 'pending' || srcState.status === 'running') {
      allUpstreamDone = false;
      continue;
    }

    if (srcState.status === 'failed' || srcState.status === 'skipped') {
      continue;
    }

    // Source is completed -- evaluate condition
    const output = nodeOutputs.get(edge.from) ?? {};
    if (evaluateCondition(edge.condition, output)) {
      anyActive = true;
    }
  }

  if (!allUpstreamDone) return 'waiting';
  if (anyActive) return 'ready';
  return 'skip';
}

/**
 * Simple async mutex for serializing state saves during concurrent execution.
 */
function createMutex() {
  let chain = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const next = chain.then(fn, fn);
      chain = next.then(() => {}, () => {});
      return next;
    },
  };
}

/**
 * Executes a workflow using DAG-based concurrent execution.
 *
 * Independent nodes (same tier, no edges between them) execute concurrently
 * via Promise.allSettled. Conditional edges gate downstream activation.
 * State is persisted after each node status change. Supports resume from
 * interrupted runs by skipping completed nodes.
 */
export async function runWorkflow(
  workflow: WorkflowDef,
  executor: TaskExecutor,
  options?: RunWorkflowOptions,
): Promise<WorkflowResult> {
  const runId = options?.runId ?? uuidv4();
  const workflowPath = options?.workflowPath ?? '';
  const sm = options?.stateManager;
  const tracker = options?.tracker;
  const baseBranch = options?.baseBranch ?? 'main';
  const saveMutex = createMutex();

  // Initialize or restore state
  const nodeStates: Record<string, NodeRunState> = {};
  const nodeOutputs = new Map<string, Record<string, unknown>>();

  if (options?.state) {
    // Resume: copy existing state, treat 'running' as 'pending'
    for (const node of workflow.nodes) {
      const existing = options.state.nodeStates[node.id];
      if (existing) {
        if (existing.status === 'running') {
          nodeStates[node.id] = { status: 'pending' };
        } else {
          nodeStates[node.id] = { ...existing };
          if (existing.status === 'completed' && existing.result) {
            nodeOutputs.set(node.id, parseNodeOutput(existing.result.resultText));
          }
        }
      } else {
        nodeStates[node.id] = { status: 'pending' };
      }
    }
  } else {
    for (const node of workflow.nodes) {
      nodeStates[node.id] = { status: 'pending' };
    }
  }

  const nodeResults: Array<{ nodeId: string; result: TaskResult }> = [];
  const skippedNodeIds: string[] = [];

  // Collect results from already-completed nodes (resume case)
  for (const node of workflow.nodes) {
    const ns = nodeStates[node.id];
    if (ns.status === 'completed' && ns.result) {
      nodeResults.push({ nodeId: node.id, result: ns.result });
    }
  }

  async function saveState(status: WorkflowRunState['status']): Promise<void> {
    if (!sm) return;
    await saveMutex.run(async () => {
      const state: WorkflowRunState = {
        runId,
        workflowPath,
        workflowDef: workflow,
        status,
        startedAt: new Date().toISOString(),
        nodeStates: { ...nodeStates },
      };
      await sm.saveRunState(state);
    });
  }

  // Save initial state
  await saveState('running');

  // Compute topological tiers for execution ordering
  const nodeIds = workflow.nodes.map((n) => n.id);
  const tiers = topologicalTiers(
    nodeIds,
    workflow.edges.map((e) => ({ from: e.from, to: e.to })),
  );

  // Execute tier by tier
  for (const tier of tiers) {
    const toExecute: string[] = [];
    for (const nodeId of tier) {
      if (nodeStates[nodeId].status === 'completed') continue;
      if (nodeStates[nodeId].status === 'skipped') continue;

      const edgeStatus = evaluateIncomingEdges(nodeId, workflow.edges, nodeStates, nodeOutputs);
      if (edgeStatus === 'skip') {
        nodeStates[nodeId] = { status: 'skipped' };
        skippedNodeIds.push(nodeId);
        await saveState('running');
        continue;
      }
      if (edgeStatus === 'ready') {
        toExecute.push(nodeId);
      }
    }

    if (toExecute.length === 0) continue;

    // Execute all ready nodes in this tier concurrently
    const promises = toExecute.map(async (nodeId) => {
      const node = workflow.nodes.find((n) => n.id === nodeId)!;
      const startedAt = new Date().toISOString();

      // Mark running
      nodeStates[nodeId] = { status: 'running', startedAt };
      await saveState('running');

      // Worktree lifecycle: create isolated worktree per node
      const worktreeTaskId = `${runId.slice(0, 8)}-${nodeId}`;
      let executionRepo = node.repo;
      let worktreeCreated = false;

      if (node.repo) {
        const worktreeInfo = await createWorktree(node.repo, worktreeTaskId, baseBranch, tracker);
        executionRepo = worktreeInfo.worktreePath;
        worktreeCreated = true;
      }

      try {
        const rendered = await renderTemplate(node.template, node.variables ?? {}, []);
        const result = await executor.executeTask(rendered.rendered, executionRepo, uuidv4());

        nodeOutputs.set(nodeId, parseNodeOutput(result.resultText));

        if (result.exitCode !== 0) {
          nodeStates[nodeId] = {
            status: 'failed',
            result,
            startedAt,
            completedAt: new Date().toISOString(),
          };
        } else {
          nodeStates[nodeId] = {
            status: 'completed',
            result,
            startedAt,
            completedAt: new Date().toISOString(),
          };
          console.log(`[workflow] Node '${nodeId}' completed successfully`);
        }

        nodeResults.push({ nodeId, result });
        await saveState('running');
        return { nodeId, result };
      } catch (err) {
        nodeStates[nodeId] = {
          status: 'failed',
          startedAt,
          completedAt: new Date().toISOString(),
        };
        await saveState('running');
        throw err;
      } finally {
        if (worktreeCreated) {
          try {
            await removeWorktree(node.repo, worktreeTaskId, tracker);
          } catch (cleanupErr) {
            console.warn(`[workflow] Failed to clean up worktree for node '${nodeId}': ${cleanupErr}`);
          }
        }
      }
    });

    await Promise.allSettled(promises);
  }

  // Determine overall status
  const failedNodes = workflow.nodes.filter(
    (n) => nodeStates[n.id].status === 'failed',
  );
  const overallStatus: 'success' | 'failed' = failedNodes.length > 0 ? 'failed' : 'success';

  await saveState(overallStatus === 'success' ? 'completed' : 'failed');

  return {
    status: overallStatus,
    nodeResults,
    failedNodeId: failedNodes.length > 0 ? failedNodes[0].id : undefined,
    skippedNodeIds: skippedNodeIds.length > 0 ? skippedNodeIds : undefined,
  };
}
