// @integration — requires Docker socket
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'fs';
import Dockerode from 'dockerode';
import { ContainerManager, createContainerManager } from './manager.js';
import { ContainerRegistry } from './registry.js';

const hasDocker = existsSync('/var/run/docker.sock');
const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

// Track containers created during tests for cleanup
const createdContainerIds: string[] = [];

async function forceRemoveContainer(id: string): Promise<void> {
  try {
    const c = docker.getContainer(id);
    await c.remove({ force: true });
  } catch {
    // Already removed — ignore
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

describe.skipIf(!hasDocker)('ContainerManager integration', () => {
  const IMAGE = 'node:20-alpine';
  let manager: ContainerManager;

  beforeEachSetup();

  function beforeEachSetup() {
    // Re-create manager before each test for isolation
    manager = createContainerManager();
  }

  it('createContainer returns ContainerInfo with correct taskId and containerName pattern', async () => {
    const taskId = `test-create-${Date.now()}`;
    const repoPath = '/tmp';

    const info = await manager.createContainer(taskId, repoPath);
    createdContainerIds.push(info.containerId);

    expect(info.taskId).toBe(taskId);
    expect(info.containerName).toBe(`agent-harness-task-${taskId}`);
    expect(info.containerId).toBeTruthy();
    expect(info.repoPath).toBe(repoPath);
    expect(info.startedAt).toBeInstanceOf(Date);

    // Clean up
    await manager.stopContainer(taskId);
  }, 30_000);

  it('inspect after createContainer shows correct isolation HostConfig flags', async () => {
    const taskId = `test-inspect-${Date.now()}`;
    const repoPath = '/tmp';

    const info = await manager.createContainer(taskId, repoPath);
    createdContainerIds.push(info.containerId);

    const container = docker.getContainer(info.containerId);
    const inspected = await container.inspect();
    const hc = inspected.HostConfig;

    expect(hc.NetworkMode).toBe('none');
    expect(hc.AutoRemove).toBe(true);
    expect(hc.ReadonlyRootfs).toBe(true);

    // Clean up
    await manager.stopContainer(taskId);
  }, 30_000);

  it('stopContainer removes the container from Docker and from registry', async () => {
    const taskId = `test-stop-${Date.now()}`;
    const repoPath = '/tmp';

    const info = await manager.createContainer(taskId, repoPath);
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
      if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 404) {
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
      Image: IMAGE,
      name: orphanName,
      Cmd: ['sh', '-c', 'sleep 60'],
      Labels: { 'agent-harness': 'true', 'agent-harness.task-id': 'orphan-task' },
      HostConfig: {
        AutoRemove: false, // Don't auto-remove so we can verify reclaimOrphans
        NetworkMode: 'none',
      },
    });
    await c.start();
    createdContainerIds.push(c.id);

    // reclaimOrphans should force-remove it
    await manager.reclaimOrphans();

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let orphanGone = false;
    try {
      const container = docker.getContainer(c.id);
      await container.inspect();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 404) {
        orphanGone = true;
      }
    }
    expect(orphanGone).toBe(true);

    // Remove from cleanup list since it's already gone
    const idx = createdContainerIds.indexOf(c.id);
    if (idx !== -1) createdContainerIds.splice(idx, 1);
  }, 30_000);
});
