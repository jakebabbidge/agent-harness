import * as fs from 'fs/promises';
import type { TaskId, WorktreeInfo } from '../types/index.js';

/**
 * BranchTracker tracks task→branch mappings in memory with optional JSON persistence.
 *
 * GIT-02: Provides register, getBranch, getAll, unregister, and persistence (load/save).
 */
export class BranchTracker {
  private readonly entries: Map<TaskId, WorktreeInfo> = new Map();
  private readonly statePath: string | undefined;

  /**
   * @param statePath Optional path to a JSON file used for persistence.
   *                  If provided, mutations (register/unregister) automatically
   *                  save state to disk. Call load() to restore on restart.
   */
  constructor(statePath?: string) {
    this.statePath = statePath;
  }

  /** Store a WorktreeInfo mapping for a task. Persists to disk if statePath set. */
  register(info: WorktreeInfo): void {
    this.entries.set(info.taskId, info);
    void this.save();
  }

  /** Return the branch name for a task, or undefined if not registered. */
  getBranch(taskId: TaskId): string | undefined {
    return this.entries.get(taskId)?.branchName;
  }

  /** Return all registered WorktreeInfo entries. */
  getAll(): WorktreeInfo[] {
    return Array.from(this.entries.values());
  }

  /** Remove the entry for a task. Persists to disk if statePath set. */
  unregister(taskId: TaskId): void {
    this.entries.delete(taskId);
    void this.save();
  }

  /**
   * Load state from disk. Safe to call when the file does not exist.
   * Must be called explicitly after construction to restore persisted state.
   */
  async load(): Promise<void> {
    if (!this.statePath) return;
    let raw: string;
    try {
      raw = await fs.readFile(this.statePath, 'utf-8');
    } catch {
      // File does not exist or is unreadable — start empty
      return;
    }
    const parsed = JSON.parse(raw) as Array<[TaskId, WorktreeInfo & { createdAt: string }]>;
    for (const [taskId, info] of parsed) {
      // Restore Date from JSON string
      this.entries.set(taskId, {
        ...info,
        createdAt: new Date(info.createdAt),
      });
    }
  }

  /** Write current state to disk as JSON. No-op if statePath not set. */
  async save(): Promise<void> {
    if (!this.statePath) return;
    const serializable = Array.from(this.entries.entries());
    await fs.writeFile(this.statePath, JSON.stringify(serializable, null, 2), 'utf-8');
  }
}
