import * as os from 'os';
import * as path from 'path';
import { loadRunState } from '../workflow/state.js';
import { runWorkflow } from '../workflow/runner.js';
import { TaskExecutor } from '../executor/executor.js';
import { QuestionStore } from '../hitl/question-store.js';
import { BranchTracker } from '../git/tracker.js';
import { removeWorktree } from '../git/worktree.js';

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

  // Create and load BranchTracker with same path convention as run.ts
  const trackerStatePath = path.join(
    os.tmpdir(), 'agent-harness', 'branches', `${runId}.json`
  );
  const tracker = new BranchTracker(trackerStatePath);
  await tracker.load(); // Restore branch state from crashed run

  // Clean up stale worktrees from crashed run before resuming
  for (const node of state.workflowDef.nodes) {
    const ns = state.nodeStates[node.id];
    if (ns && ns.status === 'running') {
      const staleTaskId = `${runId.slice(0, 8)}-${node.id}`;
      try {
        await removeWorktree(node.repo, staleTaskId, tracker);
        console.log(`[agent-harness] Cleaned up stale worktree for node '${node.id}'`);
      } catch {
        // Worktree may not exist if crash happened before creation -- that's fine
      }
    }
  }

  const questionStore = new QuestionStore();
  const executor = new TaskExecutor(questionStore);

  try {
    const result = await runWorkflow(state.workflowDef, executor, {
      runId,
      state,
      workflowPath: state.workflowPath,
      tracker,
      baseBranch: 'main',
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
