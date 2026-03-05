import { v4 as uuidv4 } from 'uuid';
import { renderTemplate } from '../template/renderer.js';
import { TaskExecutor } from '../executor/executor.js';
import type { WorkflowDef, TaskResult } from '../types/index.js';

/**
 * The aggregated result of running a complete workflow.
 */
export interface WorkflowResult {
  status: 'success' | 'failed';
  nodeResults: Array<{ nodeId: string; result: TaskResult }>;
  failedNodeId?: string;
}

/**
 * Executes a workflow sequentially — each node runs in array order.
 *
 * For each node:
 *  1. Render the template with node variables
 *  2. Execute with TaskExecutor using a fresh UUID runId
 *  3. If exitCode !== 0: stop and return failed result
 *  4. Otherwise: continue to next node
 *
 * Returns a WorkflowResult with all collected node results.
 */
export async function runWorkflow(
  workflow: WorkflowDef,
  executor: TaskExecutor,
): Promise<WorkflowResult> {
  const nodeResults: Array<{ nodeId: string; result: TaskResult }> = [];

  for (const node of workflow.nodes) {
    const runId = uuidv4();

    // Render the template with node variables
    const rendered = await renderTemplate(node.template, node.variables ?? {});

    // Execute the task
    const result = await executor.executeTask(rendered.rendered, node.repo, runId);

    nodeResults.push({ nodeId: node.id, result });

    if (result.exitCode !== 0) {
      return { status: 'failed', nodeResults, failedNodeId: node.id };
    }

    console.log(`[workflow] Node '${node.id}' completed successfully`);
  }

  return { status: 'success', nodeResults };
}
