import type { TaskId, WorktreeInfo } from '../types/index.js';
import { BranchTracker } from './tracker.js';
/**
 * Creates a git worktree for a task at `<repoPath>/.worktrees/<taskId>/`
 * on a new branch named `agent-harness/task-<taskId>`.
 *
 * GIT-01: Worktree isolation — each task gets its own filesystem-isolated working tree.
 *
 * Branch conflict behavior: if the branch already exists from a previous run,
 * git will error. Callers should call removeWorktree first to clean up stale state.
 * This is a deliberate choice: failing fast is safer than silently reusing branches.
 *
 * @param repoPath  Absolute path to the main git repository.
 * @param taskId    Unique task identifier.
 * @param baseBranch  Branch to base the new worktree branch on.
 * @param tracker   Optional BranchTracker to register the new worktree.
 */
export declare function createWorktree(repoPath: string, taskId: TaskId, baseBranch: string, tracker?: BranchTracker): Promise<WorktreeInfo>;
/**
 * Removes a git worktree and its associated branch for a task.
 *
 * GIT-01: Cleanup — removes the worktree directory and deletes the branch.
 *
 * @param repoPath  Absolute path to the main git repository.
 * @param taskId    Task identifier whose worktree should be removed.
 * @param tracker   Optional BranchTracker to unregister the worktree.
 */
export declare function removeWorktree(repoPath: string, taskId: TaskId, tracker?: BranchTracker): Promise<void>;
//# sourceMappingURL=worktree.d.ts.map