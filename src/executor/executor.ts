import * as fs from 'fs/promises';
import * as path from 'path';
import type { ContainerManager } from '../container/manager.js';
import type { TaskResult, QuestionRecord } from '../types/index.js';

/**
 * TaskExecutor delegates task execution to a Docker container via ContainerManager.
 *
 * Responsibilities:
 * - Write prompt to .harness/prompt.txt in the worktree
 * - Create and start a container that runs the agent-runner.js SDK script
 * - Poll for question.json (HITL) concurrently with waitForExit
 * - Surface agent questions to the CLI and print answer command hint
 * - Wait for the container process to exit
 * - Read RESULT.md from the worktree as structured task output
 */
export class TaskExecutor {
  private readonly containerManager: ContainerManager;

  constructor(containerManager: ContainerManager) {
    this.containerManager = containerManager;
  }

  async executeTask(
    prompt: string,
    worktreePath: string,
    runId: string,
  ): Promise<TaskResult> {
    // 1. Create .harness/ directory and write prompt file
    const harnessDir = path.join(worktreePath, '.harness');
    await fs.mkdir(harnessDir, { recursive: true });
    await fs.writeFile(path.join(harnessDir, 'prompt.txt'), prompt, 'utf-8');

    // 2. Clean up stale IPC files from previous runs (pitfall 3)
    for (const f of ['question.json', 'answer.json']) {
      try {
        await fs.unlink(path.join(harnessDir, f));
      } catch {
        // File doesn't exist -- nothing to clean up
      }
    }

    // 3. Use runId as taskId (truncate for Docker name constraints)
    const taskId = runId.slice(0, 12);

    // 4. Create and start container
    await this.containerManager.createContainer(taskId, worktreePath);

    // 5. Run waitForExit and question polling concurrently
    let containerDone = false;
    const questionPath = path.join(harnessDir, 'question.json');

    const exitPromise = this.containerManager.waitForExit(taskId).then((result) => {
      containerDone = true;
      return result;
    });

    const questionPoller = (async () => {
      while (!containerDone) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const raw = await fs.readFile(questionPath, 'utf-8');
          const q: QuestionRecord = JSON.parse(raw);
          for (const item of q.questions) {
            console.log(`\n[agent-harness] Agent question: ${item.question}`);
          }
          console.log(
            `[agent-harness] Answer with: agent-harness answer ${runId} "<your answer>"`,
          );
          // Wait for question.json to be consumed (deleted by agent-runner after answer)
          while (!containerDone) {
            await new Promise((r) => setTimeout(r, 500));
            try {
              await fs.access(questionPath);
            } catch {
              break; // question.json gone -- answer was consumed
            }
          }
        } catch {
          // question.json not present yet -- keep polling
        }
      }

      // Final check for question.json after container exits (race condition guard, pitfall 2)
      try {
        const raw = await fs.readFile(questionPath, 'utf-8');
        const q: QuestionRecord = JSON.parse(raw);
        for (const item of q.questions) {
          console.log(`\n[agent-harness] Agent question (post-exit): ${item.question}`);
        }
        console.log(
          `[agent-harness] Warning: container exited while question was pending`,
        );
      } catch {
        // No pending question -- normal exit
      }
    })();

    const { StatusCode } = await exitPromise;
    await questionPoller; // Clean up poller

    // 6. Read RESULT.md from worktree (mount persists after container exit)
    let resultText = '';
    try {
      resultText = await fs.readFile(path.join(worktreePath, 'RESULT.md'), 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }

    return { exitCode: StatusCode, resultText };
  }
}
