import type { TaskId, WorktreeInfo } from '../types/index.js';
/**
 * BranchTracker tracks task→branch mappings in memory with optional JSON persistence.
 *
 * GIT-02: Provides register, getBranch, getAll, unregister, and persistence (load/save).
 */
export declare class BranchTracker {
    private readonly entries;
    private readonly statePath;
    /**
     * @param statePath Optional path to a JSON file used for persistence.
     *                  If provided, mutations (register/unregister) automatically
     *                  save state to disk. Call load() to restore on restart.
     */
    constructor(statePath?: string);
    /** Store a WorktreeInfo mapping for a task. Persists to disk if statePath set. */
    register(info: WorktreeInfo): void;
    /** Return the branch name for a task, or undefined if not registered. */
    getBranch(taskId: TaskId): string | undefined;
    /** Return all registered WorktreeInfo entries. */
    getAll(): WorktreeInfo[];
    /** Remove the entry for a task. Persists to disk if statePath set. */
    unregister(taskId: TaskId): void;
    /**
     * Load state from disk. Safe to call when the file does not exist.
     * Must be called explicitly after construction to restore persisted state.
     */
    load(): Promise<void>;
    /** Write current state to disk as JSON. No-op if statePath not set. */
    save(): Promise<void>;
}
//# sourceMappingURL=tracker.d.ts.map