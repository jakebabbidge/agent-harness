import { v4 as uuidv4 } from 'uuid';
import { TaskExecutor } from '../executor/executor.js';
import { QuestionStore } from '../hitl/question-store.js';
import { parseWorkflow } from '../workflow/parser.js';
import { runWorkflow } from '../workflow/runner.js';
import { renderTemplate } from '../template/renderer.js';

export async function runCommand(
  target: string,
  options: { repo?: string; variables?: string },
): Promise<void> {
  // Check for API key before creating executor
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[agent-harness] Error: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const questionStore = new QuestionStore();
  const executor = new TaskExecutor(questionStore);

  const isWorkflow = target.endsWith('.yaml') || target.endsWith('.yml');

  try {
    if (isWorkflow) {
      // Workflow mode
      const workflow = await parseWorkflow(target);
      const result = await runWorkflow(workflow, executor);

      if (result.status === 'failed') {
        console.error(
          `[agent-harness] Workflow failed at node '${result.failedNodeId ?? 'unknown'}'.`,
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
        console.error('[agent-harness] Error: --repo <path> is required for template mode.');
        process.exit(1);
      }

      let variables: Record<string, unknown> = {};
      try {
        variables = JSON.parse(options.variables ?? '{}') as Record<string, unknown>;
      } catch {
        console.error('[agent-harness] Error: --variables must be a valid JSON string.');
        process.exit(1);
      }

      const rendered = await renderTemplate(target, variables, []);
      const runId = uuidv4();

      const result = await executor.executeTask(rendered.rendered, options.repo, runId);

      const truncated =
        result.resultText.length > 200
          ? result.resultText.slice(0, 200) + '...'
          : result.resultText;

      console.log(`[agent-harness] Run ${runId} complete. Exit code: ${result.exitCode}`);
      if (truncated) {
        console.log(`[agent-harness] Result: ${truncated}`);
      }

      process.exit(result.exitCode);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent-harness] Error: ${message}`);
    process.exit(1);
  }
}
