import os from 'node:os';
import Dockerode from 'dockerode';
import { ContainerRegistry } from './registry.js';
import { IMAGE_NAME } from './image.js';
import type { TaskId, ContainerInfo } from '../types/index.js';

/**
 * ContainerManager manages the full lifecycle of Docker containers for task execution.
 *
 * CONT-01: create, start, stop, orphan recovery
 * CONT-02: network isolation via iptables firewall (bridge + NET_ADMIN/NET_RAW caps)
 *
 * Devcontainer-inspired model: each container runs Claude Code CLI as its main process,
 * with firewall init as a preamble. The host waits for process exit and reads results
 * from the mounted worktree.
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
   * Container configuration (devcontainer model):
   *   - Image: agent-harness:latest (built from docker/Dockerfile)
   *   - CapAdd: NET_ADMIN, NET_RAW (required for iptables firewall)
   *   - AutoRemove: true — Docker daemon removes container after process exit
   *   - Binds: worktreePath:/workspace:rw, ~/.claude:/home/node/.claude:ro
   *   - User: node, WorkingDir: /workspace
   *   - Cmd: firewall init then Claude Code CLI with prompt file
   */
  async createContainer(
    taskId: TaskId,
    worktreePath: string,
    promptFilePath: string,
  ): Promise<ContainerInfo> {
    const containerName = `agent-harness-task-${taskId}`;
    const claudeDir = `${os.homedir()}/.claude`;

    const container = await this.docker.createContainer({
      Image: IMAGE_NAME,
      name: containerName,
      User: 'node',
      WorkingDir: '/workspace',
      Cmd: [
        'bash',
        '-c',
        `sudo /usr/local/bin/init-firewall.sh && claude --dangerously-skip-permissions -p "$(cat /workspace/${promptFilePath})"`,
      ],
      Labels: {
        'agent-harness': 'true',
        'agent-harness.task-id': taskId,
      },
      HostConfig: {
        AutoRemove: true,
        CapAdd: ['NET_ADMIN', 'NET_RAW'],
        Binds: [
          `${worktreePath}:/workspace:rw`,
          `${claudeDir}:/home/node/.claude:ro`,
        ],
      },
    });

    await container.start();

    const info: ContainerInfo = {
      taskId,
      containerId: container.id,
      containerName,
      repoPath: worktreePath,
      startedAt: new Date(),
    };

    this.registry.register(info);
    return info;
  }

  /**
   * Wait for a container to exit and return the exit status code.
   * After the container exits, it is unregistered from the registry.
   * Note: with AutoRemove=true, Docker removes the container automatically after exit.
   */
  async waitForExit(taskId: TaskId): Promise<{ StatusCode: number }> {
    const info = this.registry.get(taskId);
    if (!info) {
      throw new Error(`waitForExit: no container registered for taskId '${taskId}'`);
    }

    const container = this.docker.getContainer(info.containerId);
    const result = await container.wait();

    this.registry.unregister(taskId);
    return result;
  }

  /**
   * Stop a running container by taskId.
   * Uses a 5-second grace period before Docker force-kills.
   * Because AutoRemove is true, the container is removed by the Docker daemon after stop --
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
        // Already stopped or already removed -- proceed with unregister
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
          // Ignore 404 -- already removed between list and remove
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
