import { TaskExecutor } from '../executor/executor.js';
import type { WorkflowDef, TaskResult } from '../types/index.js';
/**
 * The aggregated result of running a complete workflow.
 */
export interface WorkflowResult {
    status: 'success' | 'failed';
    nodeResults: Array<{
        nodeId: string;
        result: TaskResult;
    }>;
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
export declare function runWorkflow(workflow: WorkflowDef, executor: TaskExecutor): Promise<WorkflowResult>;
//# sourceMappingURL=runner.d.ts.map