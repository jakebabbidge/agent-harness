/**
 * Shared TypeScript interfaces for the agent-harness.
 * All subsystems (template, git, container) import from here.
 */

/** Unique identifier for a task run. UUID recommended. */
export type TaskId = string;

/** Information about a git worktree created for a task. */
export interface WorktreeInfo {
  taskId: TaskId;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  createdAt: Date;
}

/** Information about a running Docker container for a task. */
export interface ContainerInfo {
  taskId: TaskId;
  containerId: string;
  containerName: string;
  repoPath: string;
  startedAt: Date;
}

/** Overall state of a task tracked by the harness. */
export interface TaskState {
  taskId: TaskId;
  status: 'pending' | 'running' | 'completed' | 'failed';
  worktree?: WorktreeInfo;
  container?: ContainerInfo;
  createdAt: Date;
  updatedAt: Date;
}

/** Variables passed to template rendering. */
export type TemplateVariables = Record<string, unknown>;

/** Result of rendering a template. */
export interface RenderResult {
  rendered: string;
  templatePath: string;
  partialPaths: string[];
  variables: TemplateVariables;
}
