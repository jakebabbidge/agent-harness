import * as fs from 'fs/promises';
import * as path from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { QuestionStore } from '../hitl/question-store.js';
import type { TaskResult } from '../types/index.js';

/**
 * TaskExecutor wraps the Claude Agent SDK query() function with HITL callback
 * wiring and structured result extraction.
 *
 * Responsibilities:
 * - Purge stale run state before each execution
 * - Invoke SDK query() with the given prompt and worktree path as cwd
 * - Surface AskUserQuestion tool calls to QuestionStore.askAndWait for HITL
 * - Allow all other tool calls through without interruption
 * - Map SDK result subtype ("success" | error variants) to exitCode 0/1
 * - Read RESULT.md from the worktree path as structured task output
 */
export class TaskExecutor {
  private readonly questionStore: QuestionStore;

  constructor(questionStore: QuestionStore) {
    this.questionStore = questionStore;
  }

  async executeTask(
    prompt: string,
    worktreePath: string,
    runId: string,
  ): Promise<TaskResult> {
    // Purge any stale run state first to prevent stale answer pickup
    await this.questionStore.purgeRunDir(runId);

    let exitCode = 1;

    const gen = query({
      prompt,
      options: {
        cwd: worktreePath,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'AskUserQuestion'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        canUseTool: async (toolName, input) => {
          if (toolName === 'AskUserQuestion') {
            const answers = await this.questionStore.askAndWait(runId, input as { questions: unknown[] });
            return {
              behavior: 'allow' as const,
              updatedInput: { ...input, answers },
            };
          }
          return {
            behavior: 'allow' as const,
            updatedInput: input,
          };
        },
      },
    });

    for await (const message of gen) {
      const msg = message as { type?: string; subtype?: string };
      if (msg.type === 'result') {
        exitCode = msg.subtype === 'success' ? 0 : 1;
      }
    }

    // Read RESULT.md as structured output; default to empty string if missing
    let resultText = '';
    try {
      resultText = await fs.readFile(path.join(worktreePath, 'RESULT.md'), 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }

    return { exitCode, resultText };
  }
}
