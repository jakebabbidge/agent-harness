import type { TaskId, ContainerInfo } from '../types/index.js';
/**
 * In-memory registry mapping taskId to ContainerInfo.
 * Tracks all containers managed by the harness within a single process lifetime.
 */
export declare class ContainerRegistry {
    private readonly store;
    /** Register a container for a given task. Overwrites any existing entry. */
    register(info: ContainerInfo): void;
    /** Retrieve the ContainerInfo for a given taskId, or undefined if not registered. */
    get(taskId: TaskId): ContainerInfo | undefined;
    /** Return all registered ContainerInfo entries as an array. */
    getAll(): ContainerInfo[];
    /** Remove the registry entry for a given taskId. No-op if not registered. */
    unregister(taskId: TaskId): void;
}
//# sourceMappingURL=registry.d.ts.map