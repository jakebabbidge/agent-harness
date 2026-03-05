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
/** A single question in a HITL question record. */
export interface QuestionItem {
    question: string;
    header?: string;
    options?: Array<{
        label: string;
        description?: string;
    }>;
    multiSelect?: boolean;
}
/** A record written to question.json for HITL file-based IPC. */
export interface QuestionRecord {
    runId: string;
    questions: QuestionItem[];
    timestamp: string;
}
/** A record written to answer.json after human submits answers. */
export interface AnswerRecord {
    runId: string;
    answers: Record<string, string>;
    answeredAt: string;
}
/** Definition of a single node in a workflow. */
export interface NodeDef {
    id: string;
    template: string;
    repo: string;
    variables?: Record<string, unknown>;
}
/** An edge connecting two nodes in a workflow. */
export interface EdgeDef {
    from: string;
    to: string;
}
/** A complete workflow definition parsed from YAML. */
export interface WorkflowDef {
    version: string;
    nodes: NodeDef[];
    edges: EdgeDef[];
}
/** The result returned by a completed task execution. */
export interface TaskResult {
    exitCode: number;
    resultText: string;
}
/** Runtime state of a workflow run. */
export interface RunState {
    runId: string;
    workflowPath?: string;
    status: 'running' | 'completed' | 'failed' | 'waiting_for_answer';
    startedAt: string;
    completedAt?: string;
}
//# sourceMappingURL=index.d.ts.map