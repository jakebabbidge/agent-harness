import * as fs from 'fs/promises';
import * as path from 'path';
import type { ContainerManager } from '../container/manager.js';
import type { TaskResult } from '../types/index.js';

/**
 * TaskExecutor delegates task execution to a Docker container via ContainerManager.
 *
 * Responsibilities:
 * - Write prompt to .harness/prompt.txt in the worktree
 * - Create and start a container that runs Claude Code CLI with the prompt
 * - Wait for the container process to exit
 * - Read RESULT.md from the worktree as structured task output
 *
 * Note: HITL (human-in-the-loop) is not wired for the containerized model.
 * The agent runs non-interactively with --dangerously-skip-permissions.
 * HITL can be re-added when the container HITL mechanism is designed.
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

    // 2. Use runId as taskId (truncate for Docker name constraints)
    const taskId = runId.slice(0, 12);

    // 3. Create and start container (container is started by createContainer)
    await this.containerManager.createContainer(taskId, worktreePath, '.harness/prompt.txt');

    // 4. Wait for container process to exit
    const { StatusCode } = await this.containerManager.waitForExit(taskId);

    // 5. Read RESULT.md from worktree (mount persists after container exit)
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
