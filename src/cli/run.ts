import { v4 as uuidv4 } from "uuid";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { TaskExecutor } from "../executor/executor.js";
import { QuestionStore } from "../hitl/question-store.js";
import { parseWorkflow } from "../workflow/parser.js";
import { runWorkflow } from "../workflow/runner.js";
import { renderTemplate } from "../template/renderer.js";
import { BranchTracker } from "../git/tracker.js";
import { createWorktree, removeWorktree } from "../git/worktree.js";

export async function runCommand(
  target: string,
  options: { repo?: string; variables?: string },
): Promise<void> {
  // Check for API key before creating executor
  /*if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[agent-harness] Error: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }*/

  const questionStore = new QuestionStore();
  const executor = new TaskExecutor(questionStore);

  const isWorkflow = target.endsWith(".yaml") || target.endsWith(".yml");

  // Shared runId and BranchTracker for both workflow and template mode
  const runId = uuidv4();
  const trackerDir = path.join(os.tmpdir(), "agent-harness", "branches");
  await fs.mkdir(trackerDir, { recursive: true });
  const tracker = new BranchTracker(path.join(trackerDir, `${runId}.json`));
  console.log(`[agent-harness] Branch tracker: ${trackerDir}/${runId}.json`);

  try {
    if (isWorkflow) {
      // Workflow mode
      const workflow = await parseWorkflow(target);
      console.log(`[agent-harness] Workflow run ID: ${runId}`);

      const result = await runWorkflow(workflow, executor, {
        runId,
        workflowPath: target,
        tracker,
        baseBranch: "main",
      });

      if (result.status === "failed") {
        console.error(
          `[agent-harness] Workflow failed at node '${result.failedNodeId ?? "unknown"}'. Run ID: ${runId}`,
        );
        process.exit(1);
      } else {
        console.log(
          `[agent-harness] Workflow completed successfully. Nodes executed: ${result.nodeResults.length}`,
        );
        process.exit(0);
      }
    } else {
      // Template mode
      if (!options.repo) {
        console.error(
          "[agent-harness] Error: --repo <path> is required for template mode.",
        );
        process.exit(1);
      }

      let variables: Record<string, unknown> = {};
      try {
        variables = JSON.parse(options.variables ?? "{}") as Record<
          string,
          unknown
        >;
      } catch {
        console.error(
          "[agent-harness] Error: --variables must be a valid JSON string.",
        );
        process.exit(1);
      }

      const rendered = await renderTemplate(target, variables, []);

      // Worktree lifecycle for template mode
      const taskId = runId.slice(0, 8);
      const worktreeInfo = await createWorktree(options.repo, taskId, "main", tracker);
      try {
        const result = await executor.executeTask(
          rendered.rendered,
          worktreeInfo.worktreePath,
          runId,
        );

        const truncated =
          result.resultText.length > 200
            ? result.resultText.slice(0, 200) + "..."
            : result.resultText;

        console.log(
          `[agent-harness] Run ${runId} complete. Exit code: ${result.exitCode}`,
        );
        if (truncated) {
          console.log(`[agent-harness] Result: ${truncated}`);
        }

        process.exit(result.exitCode);
      } finally {
        try {
          await removeWorktree(options.repo, taskId, tracker);
        } catch (cleanupErr) {
          console.warn(`[agent-harness] Failed to clean up worktree: ${cleanupErr}`);
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent-harness] Error: ${message}`);
    process.exit(1);
  }
}
