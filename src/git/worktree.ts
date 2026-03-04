import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import type { TaskId, WorktreeInfo } from '../types/index.js';
import { BranchTracker } from './tracker.js';

const execFileAsync = promisify(execFile);

/**
 * Wraps execFileAsync to include git stderr in the thrown Error message.
 */
async function runGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout;
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'stderr' in err &&
      typeof (err as { stderr: unknown }).stderr === 'string'
    ) {
      const stderr = (err as { stderr: string }).stderr;
      throw new Error(`git ${args[0]} failed: ${stderr.trim()}`);
    }
    throw err;
  }
}

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
export async function createWorktree(
  repoPath: string,
  taskId: TaskId,
  baseBranch: string,
  tracker?: BranchTracker,
): Promise<WorktreeInfo> {
  const branchName = `agent-harness/task-${taskId}`;
  const worktreePath = path.join(repoPath, '.worktrees', taskId);

  await runGit(
    ['worktree', 'add', '-b', branchName, worktreePath, baseBranch],
    repoPath,
  );

  const info: WorktreeInfo = {
    taskId,
    worktreePath,
    branchName,
    baseBranch,
    createdAt: new Date(),
  };

  tracker?.register(info);

  return info;
}

/**
 * Removes a git worktree and its associated branch for a task.
 *
 * GIT-01: Cleanup — removes the worktree directory and deletes the branch.
 *
 * @param repoPath  Absolute path to the main git repository.
 * @param taskId    Task identifier whose worktree should be removed.
 * @param tracker   Optional BranchTracker to unregister the worktree.
 */
export async function removeWorktree(
  repoPath: string,
  taskId: TaskId,
  tracker?: BranchTracker,
): Promise<void> {
  const branchName = `agent-harness/task-${taskId}`;
  const worktreePath = path.join(repoPath, '.worktrees', taskId);

  await runGit(['worktree', 'remove', '--force', worktreePath], repoPath);
  await runGit(['worktree', 'prune'], repoPath);
  await runGit(['branch', '-d', branchName], repoPath);

  tracker?.unregister(taskId);
}
