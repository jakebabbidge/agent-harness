import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { TaskExecutor } from './executor.js';

/** Create a mock ContainerManager matching the real interface. */
function makeMockContainerManager() {
  return {
    createContainer: vi.fn().mockResolvedValue({
      taskId: 'test-task',
      containerId: 'abc123',
      containerName: 'agent-harness-task-test-task',
      repoPath: '/tmp/test',
      startedAt: new Date(),
    }),
    waitForExit: vi.fn().mockResolvedValue({ StatusCode: 0 }),
    stopContainer: vi.fn().mockResolvedValue(undefined),
    reclaimOrphans: vi.fn().mockResolvedValue(undefined),
    registry: { register: vi.fn(), get: vi.fn(), getAll: vi.fn(), unregister: vi.fn() },
  };
}

describe('TaskExecutor', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'executor-test-'));
    vi.clearAllMocks();
  });

  it('writes prompt to .harness/prompt.txt before creating container', async () => {
    const mock = makeMockContainerManager();
    const executor = new TaskExecutor(mock as never);
    await executor.executeTask('do the thing', tmpDir, 'run-123456789');

    const promptContent = await fs.readFile(
      path.join(tmpDir, '.harness', 'prompt.txt'),
      'utf-8',
    );
    expect(promptContent).toBe('do the thing');
  });

  it('calls createContainer with correct taskId, worktreePath, and prompt file path', async () => {
    const mock = makeMockContainerManager();
    const executor = new TaskExecutor(mock as never);
    await executor.executeTask('test prompt', tmpDir, 'run-123456789');

    expect(mock.createContainer).toHaveBeenCalledWith(
      'run-12345678',  // runId.slice(0, 12)
      tmpDir,
      '.harness/prompt.txt',
    );
  });

  it('calls waitForExit and returns its StatusCode as exitCode', async () => {
    const mock = makeMockContainerManager();
    mock.waitForExit.mockResolvedValue({ StatusCode: 0 });

    const executor = new TaskExecutor(mock as never);
    const result = await executor.executeTask('test', tmpDir, 'run-000000000');

    expect(mock.waitForExit).toHaveBeenCalledWith('run-00000000');
    expect(result.exitCode).toBe(0);
  });

  it('returns exitCode from container when non-zero', async () => {
    const mock = makeMockContainerManager();
    mock.waitForExit.mockResolvedValue({ StatusCode: 1 });

    const executor = new TaskExecutor(mock as never);
    const result = await executor.executeTask('test', tmpDir, 'run-111111111');

    expect(result.exitCode).toBe(1);
  });

  it('reads RESULT.md from worktree after container exits', async () => {
    const mock = makeMockContainerManager();
    await fs.writeFile(path.join(tmpDir, 'RESULT.md'), 'Task done.', 'utf-8');

    const executor = new TaskExecutor(mock as never);
    const result = await executor.executeTask('test', tmpDir, 'run-222222222');

    expect(result.resultText).toBe('Task done.');
  });

  it('returns empty resultText when RESULT.md does not exist', async () => {
    const mock = makeMockContainerManager();

    const executor = new TaskExecutor(mock as never);
    const result = await executor.executeTask('test', tmpDir, 'run-333333333');

    expect(result.resultText).toBe('');
  });
});
