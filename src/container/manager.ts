import Dockerode from 'dockerode';
import { ContainerRegistry } from './registry.js';
import type { TaskId, ContainerInfo } from '../types/index.js';

/** Default Docker image used for task containers. */
const DEFAULT_IMAGE = 'node:20-alpine';

/**
 * ContainerManager manages the full lifecycle of Docker containers for task execution.
 *
 * CONT-01: create, start, stop, orphan recovery
 * CONT-02: network isolation (none), read-only root filesystem, tmpfs scratch paths
 */
export class ContainerManager {
  readonly registry: ContainerRegistry;
  private readonly docker: Dockerode;

  constructor(docker: Dockerode, registry?: ContainerRegistry) {
    this.docker = docker;
    this.registry = registry ?? new ContainerRegistry();
  }

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
  async createContainer(taskId: TaskId, repoPath: string): Promise<ContainerInfo> {
    const containerName = `agent-harness-task-${taskId}`;

    const container = await this.docker.createContainer({
      Image: DEFAULT_IMAGE,
      name: containerName,
      Cmd: ['sh', '-c', 'sleep infinity'],
      Labels: {
        'agent-harness': 'true',
        'agent-harness.task-id': taskId,
      },
      HostConfig: {
        AutoRemove: true,
        NetworkMode: 'none',
        ReadonlyRootfs: true,
        Tmpfs: {
          '/tmp': '',
          '/home': '',
        },
        Binds: [`${repoPath}:/workspace:rw`],
      },
    });

    await container.start();

    const info: ContainerInfo = {
      taskId,
      containerId: container.id,
      containerName,
      repoPath,
      startedAt: new Date(),
    };

    this.registry.register(info);
    return info;
  }

  /**
   * Stop a running container by taskId.
   * Uses a 5-second grace period before Docker force-kills.
   * Because AutoRemove is true, the container is removed by the Docker daemon after stop —
   * calling remove() explicitly afterward would result in a 404 error.
   * Unregisters the container from the in-memory registry.
   */
  async stopContainer(taskId: TaskId): Promise<void> {
    const info = this.registry.get(taskId);
    if (!info) {
      throw new Error(`stopContainer: no container registered for taskId '${taskId}'`);
    }

    const container = this.docker.getContainer(info.containerId);
    try {
      await container.stop({ t: 5 });
    } catch (err: unknown) {
      // Ignore 304 (container already stopped) and 404 (already removed)
      if (
        err &&
        typeof err === 'object' &&
        'statusCode' in err &&
        ((err as { statusCode: number }).statusCode === 304 ||
          (err as { statusCode: number }).statusCode === 404)
      ) {
        // Already stopped or already removed — proceed with unregister
      } else {
        throw err;
      }
    }

    this.registry.unregister(taskId);
  }

  /**
   * Reclaim orphaned containers left over from previous harness runs.
   * Lists all containers (running or stopped) with the label `agent-harness=true`
   * and force-removes them. Called on startup before any new task is created.
   */
  async reclaimOrphans(): Promise<void> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: ['agent-harness=true'] },
    });

    await Promise.all(
      containers.map(async (info) => {
        try {
          const container = this.docker.getContainer(info.Id);
          await container.remove({ force: true });
        } catch (err: unknown) {
          // Ignore 404 — already removed between list and remove
          if (
            err &&
            typeof err === 'object' &&
            'statusCode' in err &&
            (err as { statusCode: number }).statusCode === 404
          ) {
            return;
          }
          throw err;
        }
      }),
    );
  }
}

/**
 * Factory function that creates a ContainerManager with a real Docker socket connection.
 * @param socketPath  Path to the Docker daemon socket (default: /var/run/docker.sock)
 */
export function createContainerManager(socketPath?: string): ContainerManager {
  const docker = new Dockerode({ socketPath: socketPath ?? '/var/run/docker.sock' });
  return new ContainerManager(docker);
}
