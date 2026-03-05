// @integration -- requires Docker socket and agent-harness:latest image
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import Dockerode from 'dockerode';
import { ContainerManager, createContainerManager } from './manager.js';
import { ContainerRegistry } from './registry.js';
import { IMAGE_NAME } from './image.js';

// Use DOCKER_AVAILABLE env var if set; otherwise fall back to socket file existence.
// Note: socket file may exist but Docker daemon may not be running (e.g. Docker Desktop stopped).
// Set DOCKER_AVAILABLE=1 in environments where Docker daemon is confirmed running.
const hasDocker =
  process.env.DOCKER_AVAILABLE === '1' || process.env.DOCKER_AVAILABLE === 'true'
    ? true
    : existsSync('/var/run/docker.sock') && process.env.DOCKER_AVAILABLE !== '0';

const DOCKER_SOCKET =
  process.env.DOCKER_HOST?.replace('unix://', '') ?? '/var/run/docker.sock';
const docker = new Dockerode({ socketPath: DOCKER_SOCKET });

// Check if agent-harness:latest image is available
let hasImage = false;
try {
  if (hasDocker) {
    await docker.getImage(IMAGE_NAME).inspect();
    hasImage = true;
  }
} catch {
  // Image not built -- skip container creation tests
}

// Track containers created during tests for cleanup
const createdContainerIds: string[] = [];

async function forceRemoveContainer(id: string): Promise<void> {
  try {
    const c = docker.getContainer(id);
    await c.remove({ force: true });
  } catch {
    // Already removed -- ignore
  }
}

afterEach(async () => {
  // Clean up any containers that survived a failed test
  for (const id of createdContainerIds) {
    await forceRemoveContainer(id);
  }
  createdContainerIds.length = 0;
});

describe.skipIf(!hasDocker)('ContainerRegistry', () => {
  it('registers and retrieves a ContainerInfo by taskId', () => {
    const registry = new ContainerRegistry();
    const info = {
      taskId: 'test-task-1',
      containerId: 'abc123',
      containerName: 'agent-harness-task-test-task-1',
      repoPath: '/tmp/repo',
      startedAt: new Date(),
    };
    registry.register(info);
    expect(registry.get('test-task-1')).toEqual(info);
  });

  it('returns undefined for unknown taskId', () => {
    const registry = new ContainerRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('unregisters a taskId', () => {
    const registry = new ContainerRegistry();
    const info = {
      taskId: 'test-task-2',
      containerId: 'def456',
      containerName: 'agent-harness-task-test-task-2',
      repoPath: '/tmp/repo',
      startedAt: new Date(),
    };
    registry.register(info);
    registry.unregister('test-task-2');
    expect(registry.get('test-task-2')).toBeUndefined();
  });

  it('getAll returns all registered entries', () => {
    const registry = new ContainerRegistry();
    const info1 = {
      taskId: 'task-a',
      containerId: 'aaa',
      containerName: 'agent-harness-task-task-a',
      repoPath: '/tmp/a',
      startedAt: new Date(),
    };
    const info2 = {
      taskId: 'task-b',
      containerId: 'bbb',
      containerName: 'agent-harness-task-task-b',
      repoPath: '/tmp/b',
      startedAt: new Date(),
    };
    registry.register(info1);
    registry.register(info2);
    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContainEqual(info1);
    expect(all).toContainEqual(info2);
  });
});

describe.skipIf(!hasDocker || !hasImage)('ContainerManager integration', () => {
  let manager: ContainerManager;

  beforeEach(() => {
    // Re-create manager before each test for isolation
    manager = createContainerManager();
  });

  it('createContainer returns ContainerInfo with correct taskId and containerName pattern', async () => {
    const taskId = `test-create-${Date.now()}`;
    const worktreePath = '/tmp';

    const info = await manager.createContainer(taskId, worktreePath, '.harness/prompt.txt');
    createdContainerIds.push(info.containerId);

    expect(info.taskId).toBe(taskId);
    expect(info.containerName).toBe(`agent-harness-task-${taskId}`);
    expect(info.containerId).toBeTruthy();
    expect(info.repoPath).toBe(worktreePath);
    expect(info.startedAt).toBeInstanceOf(Date);

    // Clean up
    await manager.stopContainer(taskId);
    const idx = createdContainerIds.indexOf(info.containerId);
    if (idx !== -1) createdContainerIds.splice(idx, 1);
  }, 30_000);

  it('inspect after createContainer shows correct devcontainer HostConfig flags', async () => {
    const taskId = `test-inspect-${Date.now()}`;
    const worktreePath = '/tmp';

    const info = await manager.createContainer(taskId, worktreePath, '.harness/prompt.txt');
    createdContainerIds.push(info.containerId);

    const container = docker.getContainer(info.containerId);
    const inspected = await container.inspect();
    const hc = inspected.HostConfig;

    // Devcontainer model: bridge networking with NET_ADMIN/NET_RAW caps
    expect(hc.AutoRemove).toBe(true);
    expect(hc.CapAdd).toContain('NET_ADMIN');
    expect(hc.CapAdd).toContain('NET_RAW');

    // Volume mounts: workspace (rw) and .claude (ro)
    const binds = hc.Binds ?? [];
    expect(binds.some((b: string) => b.includes('/workspace:rw'))).toBe(true);
    expect(binds.some((b: string) => b.includes('/.claude:'))).toBe(true);

    // Clean up
    await manager.stopContainer(taskId);
    const idx = createdContainerIds.indexOf(info.containerId);
    if (idx !== -1) createdContainerIds.splice(idx, 1);
  }, 30_000);

  it('stopContainer removes the container from registry and it no longer exists in Docker', async () => {
    const taskId = `test-stop-${Date.now()}`;
    const worktreePath = '/tmp';

    const info = await manager.createContainer(taskId, worktreePath, '.harness/prompt.txt');
    const containerId = info.containerId;
    createdContainerIds.push(containerId);

    await manager.stopContainer(taskId);

    // Registry entry should be gone
    const registry = (manager as unknown as { registry: ContainerRegistry }).registry;
    expect(registry.get(taskId)).toBeUndefined();

    // Docker should not know about the container (AutoRemove removes it)
    // Wait a moment for Docker to finish removing it
    await new Promise((resolve) => setTimeout(resolve, 2000));

    let containerGone = false;
    try {
      const c = docker.getContainer(containerId);
      await c.inspect();
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'statusCode' in err &&
        (err as { statusCode: number }).statusCode === 404
      ) {
        containerGone = true;
      }
    }
    expect(containerGone).toBe(true);

    // Remove from cleanup list since it's already gone
    const idx = createdContainerIds.indexOf(containerId);
    if (idx !== -1) createdContainerIds.splice(idx, 1);
  }, 30_000);

  it('reclaimOrphans removes labeled orphan containers created outside the manager', async () => {
    // Create a container directly via dockerode, bypassing the manager
    const orphanName = `agent-harness-orphan-${Date.now()}`;
    const c = await docker.createContainer({
      Image: IMAGE_NAME,
      name: orphanName,
      Cmd: ['sleep', '60'],
      Labels: { 'agent-harness': 'true', 'agent-harness.task-id': 'orphan-task' },
      HostConfig: {
        AutoRemove: false, // Don't auto-remove so we can verify reclaimOrphans
      },
    });
    await c.start();
    createdContainerIds.push(c.id);

    // reclaimOrphans should force-remove it
    await manager.reclaimOrphans();

    // Wait a moment for Docker to process
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let orphanGone = false;
    try {
      const container = docker.getContainer(c.id);
      await container.inspect();
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'statusCode' in err &&
        (err as { statusCode: number }).statusCode === 404
      ) {
        orphanGone = true;
      }
    }
    expect(orphanGone).toBe(true);

    // Remove from cleanup list since it's already gone
    const idx = createdContainerIds.indexOf(c.id);
    if (idx !== -1) createdContainerIds.splice(idx, 1);
  }, 30_000);
});
