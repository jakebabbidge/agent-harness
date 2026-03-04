import type { TaskId, ContainerInfo } from '../types/index.js';

/**
 * In-memory registry mapping taskId to ContainerInfo.
 * Tracks all containers managed by the harness within a single process lifetime.
 */
export class ContainerRegistry {
  private readonly store = new Map<TaskId, ContainerInfo>();

  /** Register a container for a given task. Overwrites any existing entry. */
  register(info: ContainerInfo): void {
    this.store.set(info.taskId, info);
  }

  /** Retrieve the ContainerInfo for a given taskId, or undefined if not registered. */
  get(taskId: TaskId): ContainerInfo | undefined {
    return this.store.get(taskId);
  }

  /** Return all registered ContainerInfo entries as an array. */
  getAll(): ContainerInfo[] {
    return Array.from(this.store.values());
  }

  /** Remove the registry entry for a given taskId. No-op if not registered. */
  unregister(taskId: TaskId): void {
    this.store.delete(taskId);
  }
}
