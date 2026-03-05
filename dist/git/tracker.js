import * as fs from 'fs/promises';
/**
 * BranchTracker tracks task→branch mappings in memory with optional JSON persistence.
 *
 * GIT-02: Provides register, getBranch, getAll, unregister, and persistence (load/save).
 */
export class BranchTracker {
    entries = new Map();
    statePath;
    /**
     * @param statePath Optional path to a JSON file used for persistence.
     *                  If provided, mutations (register/unregister) automatically
     *                  save state to disk. Call load() to restore on restart.
     */
    constructor(statePath) {
        this.statePath = statePath;
    }
    /** Store a WorktreeInfo mapping for a task. Persists to disk if statePath set. */
    register(info) {
        this.entries.set(info.taskId, info);
        void this.save();
    }
    /** Return the branch name for a task, or undefined if not registered. */
    getBranch(taskId) {
        return this.entries.get(taskId)?.branchName;
    }
    /** Return all registered WorktreeInfo entries. */
    getAll() {
        return Array.from(this.entries.values());
    }
    /** Remove the entry for a task. Persists to disk if statePath set. */
    unregister(taskId) {
        this.entries.delete(taskId);
        void this.save();
    }
    /**
     * Load state from disk. Safe to call when the file does not exist.
     * Must be called explicitly after construction to restore persisted state.
     */
    async load() {
        if (!this.statePath)
            return;
        let raw;
        try {
            raw = await fs.readFile(this.statePath, 'utf-8');
        }
        catch {
            // File does not exist or is unreadable — start empty
            return;
        }
        const parsed = JSON.parse(raw);
        for (const [taskId, info] of parsed) {
            // Restore Date from JSON string
            this.entries.set(taskId, {
                ...info,
                createdAt: new Date(info.createdAt),
            });
        }
    }
    /** Write current state to disk as JSON. No-op if statePath not set. */
    async save() {
        if (!this.statePath)
            return;
        const serializable = Array.from(this.entries.entries());
        await fs.writeFile(this.statePath, JSON.stringify(serializable, null, 2), 'utf-8');
    }
}
//# sourceMappingURL=tracker.js.map