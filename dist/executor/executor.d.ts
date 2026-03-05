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
export declare class TaskExecutor {
    private readonly questionStore;
    constructor(questionStore: QuestionStore);
    executeTask(prompt: string, worktreePath: string, runId: string): Promise<TaskResult>;
}
//# sourceMappingURL=executor.d.ts.map