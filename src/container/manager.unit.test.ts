import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dockerode from 'dockerode';
import { ContainerManager } from './manager.js';

/**
 * Unit tests for ContainerManager.createContainer configuration.
 * Validates Cmd, Env, and signature changes for agent-runner.js integration.
 */

function makeMockDocker() {
  const mockContainer = {
    id: 'mock-container-id-123',
    start: vi.fn().mockResolvedValue(undefined),
  };
  const mockDocker = {
    createContainer: vi.fn().mockResolvedValue(mockContainer),
    getContainer: vi.fn(),
    listContainers: vi.fn().mockResolvedValue([]),
  } as unknown as Dockerode;
  return { mockDocker, mockContainer };
}

describe('ContainerManager.createContainer (unit)', () => {
  let manager: ContainerManager;
  let mockDocker: Dockerode;

  beforeEach(() => {
    const mocks = makeMockDocker();
    mockDocker = mocks.mockDocker;
    manager = new ContainerManager(mockDocker);
    // Set ANTHROPIC_API_KEY in env for test
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
  });

  it('Cmd includes "node /usr/local/lib/agent-runner.js" (not claude --dangerously-skip-permissions)', async () => {
    await manager.createContainer('task-1', '/tmp/worktree');

    const callArgs = (mockDocker.createContainer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const cmd = callArgs.Cmd.join(' ');

    expect(cmd).toContain('node /usr/local/lib/agent-runner.js');
    expect(cmd).not.toContain('claude --dangerously-skip-permissions');
  });

  it('passes ANTHROPIC_API_KEY env var to container', async () => {
    await manager.createContainer('task-2', '/tmp/worktree');

    const callArgs = (mockDocker.createContainer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const env: string[] = callArgs.Env || [];

    expect(env.some((e: string) => e.startsWith('ANTHROPIC_API_KEY='))).toBe(true);
    expect(env.some((e: string) => e === 'ANTHROPIC_API_KEY=test-key-123')).toBe(true);
  });

  it('passes HARNESS_IPC_DIR env var to container', async () => {
    await manager.createContainer('task-3', '/tmp/worktree');

    const callArgs = (mockDocker.createContainer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const env: string[] = callArgs.Env || [];

    expect(env.some((e: string) => e === 'HARNESS_IPC_DIR=/workspace/.harness')).toBe(true);
  });

  it('createContainer no longer requires promptFilePath parameter (2-arg signature)', async () => {
    // Should work with just taskId and worktreePath
    await manager.createContainer('task-4', '/tmp/worktree');

    expect(mockDocker.createContainer).toHaveBeenCalledTimes(1);
  });
});
