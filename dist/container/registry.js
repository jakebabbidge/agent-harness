/**
 * In-memory registry mapping taskId to ContainerInfo.
 * Tracks all containers managed by the harness within a single process lifetime.
 */
export class ContainerRegistry {
    store = new Map();
    /** Register a container for a given task. Overwrites any existing entry. */
    register(info) {
        this.store.set(info.taskId, info);
    }
    /** Retrieve the ContainerInfo for a given taskId, or undefined if not registered. */
    get(taskId) {
        return this.store.get(taskId);
    }
    /** Return all registered ContainerInfo entries as an array. */
    getAll() {
        return Array.from(this.store.values());
    }
    /** Remove the registry entry for a given taskId. No-op if not registered. */
    unregister(taskId) {
        this.store.delete(taskId);
    }
}
//# sourceMappingURL=registry.js.map