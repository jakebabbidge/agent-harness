import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  it('calls createContainer with correct taskId and worktreePath (no promptFilePath)', async () => {
    const mock = makeMockContainerManager();
    const executor = new TaskExecutor(mock as never);
    await executor.executeTask('test prompt', tmpDir, 'run-123456789');

    expect(mock.createContainer).toHaveBeenCalledWith(
      'run-12345678',  // runId.slice(0, 12)
      tmpDir,
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

  it('cleans up stale question.json and answer.json before creating container', async () => {
    const mock = makeMockContainerManager();
    const harnessDir = path.join(tmpDir, '.harness');
    await fs.mkdir(harnessDir, { recursive: true });

    // Write stale IPC files
    await fs.writeFile(path.join(harnessDir, 'question.json'), '{"stale":true}');
    await fs.writeFile(path.join(harnessDir, 'answer.json'), '{"stale":true}');

    const executor = new TaskExecutor(mock as never);
    await executor.executeTask('test', tmpDir, 'run-444444444');

    // Stale files should be gone (cleaned up before container creation)
    let questionExists = true;
    let answerExists = true;
    try { await fs.access(path.join(harnessDir, 'question.json')); } catch { questionExists = false; }
    try { await fs.access(path.join(harnessDir, 'answer.json')); } catch { answerExists = false; }

    expect(questionExists).toBe(false);
    expect(answerExists).toBe(false);
  });

  it('polls .harness/question.json concurrently with waitForExit and logs question', async () => {
    const mock = makeMockContainerManager();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // waitForExit resolves after 600ms (giving time for question to appear)
    mock.waitForExit.mockImplementation(() =>
      new Promise((resolve) => setTimeout(() => resolve({ StatusCode: 0 }), 600)),
    );

    const executor = new TaskExecutor(mock as never);
    const harnessDir = path.join(tmpDir, '.harness');

    // Simulate question.json appearing 200ms after execution starts
    setTimeout(async () => {
      await fs.writeFile(
        path.join(harnessDir, 'question.json'),
        JSON.stringify({
          runId: 'container',
          questions: [{ question: 'What color?' }],
          timestamp: new Date().toISOString(),
        }),
      );
    }, 200);

    const result = await executor.executeTask('test', tmpDir, 'run-555555555');

    expect(result.exitCode).toBe(0);
    // Verify the question was surfaced via console.log
    const logCalls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(logCalls.some((msg: string) => typeof msg === 'string' && msg.includes('What color?'))).toBe(true);
    expect(logCalls.some((msg: string) => typeof msg === 'string' && msg.includes('agent-harness answer'))).toBe(true);

    consoleSpy.mockRestore();
  });

  it('when container exits immediately, polling stops and returns correct TaskResult', async () => {
    const mock = makeMockContainerManager();
    mock.waitForExit.mockResolvedValue({ StatusCode: 0 });

    const executor = new TaskExecutor(mock as never);
    const result = await executor.executeTask('test', tmpDir, 'run-666666666');

    expect(result.exitCode).toBe(0);
    expect(result.resultText).toBe('');
  });

  it('createContainer called without promptFilePath (updated signature)', async () => {
    const mock = makeMockContainerManager();
    const executor = new TaskExecutor(mock as never);
    await executor.executeTask('test', tmpDir, 'run-777777777');

    // Verify 2-arg call (no promptFilePath)
    expect(mock.createContainer).toHaveBeenCalledWith(
      'run-77777777',
      tmpDir,
    );
  });
});
