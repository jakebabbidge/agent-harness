import Dockerode from 'dockerode';
import { ContainerRegistry } from './registry.js';
import type { TaskId, ContainerInfo } from '../types/index.js';
/**
 * ContainerManager manages the full lifecycle of Docker containers for task execution.
 *
 * CONT-01: create, start, stop, orphan recovery
 * CONT-02: network isolation (none), read-only root filesystem, tmpfs scratch paths
 */
export declare class ContainerManager {
    readonly registry: ContainerRegistry;
    private readonly docker;
    constructor(docker: Dockerode, registry?: ContainerRegistry);
    /**
     * Create and start a container for the given task.
     * The container is registered in the in-memory registry.
     * Returns ContainerInfo describing the created container.
     *
     * HostConfig flags applied for CONT-02:
     *   - NetworkMode: 'none'     — no external network access
     *   - ReadonlyRootfs: true    — root filesystem is read-only
     *   - AutoRemove: true        — Docker daemon removes container after stop (SIGKILL-safe)
     *   - Tmpfs: /tmp, /home      — writable scratch space
     *   - Binds: repoPath:/workspace:rw — repo mounted at /workspace
     */
    createContainer(taskId: TaskId, repoPath: string): Promise<ContainerInfo>;
    /**
     * Stop a running container by taskId.
     * Uses a 5-second grace period before Docker force-kills.
     * Because AutoRemove is true, the container is removed by the Docker daemon after stop —
     * calling remove() explicitly afterward would result in a 404 error.
     * Unregisters the container from the in-memory registry.
     */
    stopContainer(taskId: TaskId): Promise<void>;
    /**
     * Reclaim orphaned containers left over from previous harness runs.
     * Lists all containers (running or stopped) with the label `agent-harness=true`
     * and force-removes them. Called on startup before any new task is created.
     */
    reclaimOrphans(): Promise<void>;
}
/**
 * Factory function that creates a ContainerManager with a real Docker socket connection.
 * @param socketPath  Path to the Docker daemon socket (default: /var/run/docker.sock)
 */
export declare function createContainerManager(socketPath?: string): ContainerManager;
//# sourceMappingURL=manager.d.ts.map