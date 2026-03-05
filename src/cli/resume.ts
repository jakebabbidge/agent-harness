import { loadRunState } from '../workflow/state.js';
import { runWorkflow } from '../workflow/runner.js';
import { TaskExecutor } from '../executor/executor.js';
import { QuestionStore } from '../hitl/question-store.js';

export async function resumeCommand(runId: string): Promise<void> {
  const state = await loadRunState(runId);

  if (!state) {
    console.error(`[agent-harness] No workflow state found for run ID: ${runId}`);
    process.exit(1);
  }

  if (state.status === 'completed') {
    console.log('[agent-harness] Workflow already completed.');
    process.exit(0);
  }

  const totalNodes = state.workflowDef.nodes.length;
  const completedNodes = Object.values(state.nodeStates).filter(
    (ns) => ns.status === 'completed',
  ).length;

  console.log(
    `[agent-harness] Resuming workflow run ${runId} (${completedNodes}/${totalNodes} nodes already completed)`,
  );

  const questionStore = new QuestionStore();
  const executor = new TaskExecutor(questionStore);

  try {
    const result = await runWorkflow(state.workflowDef, executor, {
      runId,
      state,
      workflowPath: state.workflowPath,
    });

    if (result.status === 'failed') {
      console.error(
        `[agent-harness] Resumed workflow failed at node '${result.failedNodeId ?? 'unknown'}'. Run ID: ${runId}`,
      );
      process.exit(1);
    } else {
      console.log(
        `[agent-harness] Resumed workflow completed successfully. Nodes executed: ${result.nodeResults.length}`,
      );
      process.exit(0);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent-harness] Error: ${message}`);
    process.exit(1);
  }
}
