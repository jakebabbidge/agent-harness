import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Mock the SDK before importing executor
vi.mock('@anthropic-ai/claude-agent-sdk', () => {
  const mockQuery = vi.fn();
  return { query: mockQuery };
});

import { query } from '@anthropic-ai/claude-agent-sdk';
import { TaskExecutor } from './executor.js';

// Helper: create a mock async generator that yields given messages
function makeAsyncGen(messages: Record<string, unknown>[]) {
  return async function* () {
    for (const msg of messages) {
      yield msg;
    }
  };
}

// Helper to create a mock QuestionStore
function makeMockStore() {
  return {
    askAndWait: vi.fn().mockResolvedValue({ answer: 'yes' }),
    purgeRunDir: vi.fn().mockResolvedValue(undefined),
  };
}

describe('TaskExecutor', () => {
  let tmpDir: string;
  const mockQuery = vi.mocked(query);

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'executor-test-'));
    vi.clearAllMocks();
  });

  it('calls query with correct prompt and cwd', async () => {
    let capturedOptions: Record<string, unknown> | undefined;
    let capturedPrompt: string | undefined;

    mockQuery.mockImplementation((params: { prompt: string; options?: Record<string, unknown> }) => {
      capturedPrompt = params.prompt as string;
      capturedOptions = params.options as Record<string, unknown>;
      return makeAsyncGen([{ type: 'result', subtype: 'success' }])();
    });

    const store = makeMockStore();
    const executor = new TaskExecutor(store as never);
    await executor.executeTask('do the thing', tmpDir, 'run-123');

    expect(capturedPrompt).toBe('do the thing');
    expect(capturedOptions).toBeDefined();
    expect((capturedOptions as Record<string, unknown>).cwd).toBe(tmpDir);
  });

  it('returns exitCode 0 when SDK result subtype is success', async () => {
    mockQuery.mockImplementation(() =>
      makeAsyncGen([{ type: 'result', subtype: 'success' }])(),
    );

    const store = makeMockStore();
    const executor = new TaskExecutor(store as never);
    const result = await executor.executeTask('test', tmpDir, 'run-1');

    expect(result.exitCode).toBe(0);
  });

  it('returns exitCode 1 when SDK result subtype is error_during_execution', async () => {
    mockQuery.mockImplementation(() =>
      makeAsyncGen([{ type: 'result', subtype: 'error_during_execution' }])(),
    );

    const store = makeMockStore();
    const executor = new TaskExecutor(store as never);
    const result = await executor.executeTask('test', tmpDir, 'run-2');

    expect(result.exitCode).toBe(1);
  });

  it('canUseTool delegates AskUserQuestion to QuestionStore.askAndWait', async () => {
    let capturedCanUseTool: ((toolName: string, input: Record<string, unknown>, options: { signal: AbortSignal; toolUseID: string }) => Promise<unknown>) | undefined;

    mockQuery.mockImplementation((params: { prompt: string; options?: Record<string, unknown> }) => {
      capturedCanUseTool = (params.options as Record<string, unknown>)?.canUseTool as typeof capturedCanUseTool;
      return makeAsyncGen([{ type: 'result', subtype: 'success' }])();
    });

    const store = makeMockStore();
    store.askAndWait.mockResolvedValue({ answer: 'yes' });
    const executor = new TaskExecutor(store as never);
    await executor.executeTask('test', tmpDir, 'run-3');

    expect(capturedCanUseTool).toBeDefined();

    const fakeSignal = new AbortController().signal;
    const result = await capturedCanUseTool!('AskUserQuestion', { questions: ['What?'] }, { signal: fakeSignal, toolUseID: 'tool-1' });

    expect(store.askAndWait).toHaveBeenCalledWith('run-3', { questions: ['What?'] });
    expect(result).toEqual({
      behavior: 'allow',
      updatedInput: { questions: ['What?'], answers: { answer: 'yes' } },
    });
  });

  it('canUseTool returns allow for non-AskUserQuestion tools', async () => {
    let capturedCanUseTool: ((toolName: string, input: Record<string, unknown>, options: { signal: AbortSignal; toolUseID: string }) => Promise<unknown>) | undefined;

    mockQuery.mockImplementation((params: { prompt: string; options?: Record<string, unknown> }) => {
      capturedCanUseTool = (params.options as Record<string, unknown>)?.canUseTool as typeof capturedCanUseTool;
      return makeAsyncGen([{ type: 'result', subtype: 'success' }])();
    });

    const store = makeMockStore();
    const executor = new TaskExecutor(store as never);
    await executor.executeTask('test', tmpDir, 'run-4');

    const fakeSignal = new AbortController().signal;
    const bashInput = { command: 'ls' };
    const result = await capturedCanUseTool!('Bash', bashInput, { signal: fakeSignal, toolUseID: 'tool-2' });

    expect(store.askAndWait).not.toHaveBeenCalled();
    expect(result).toEqual({ behavior: 'allow', updatedInput: bashInput });
  });

  it('reads RESULT.md content as resultText after execution', async () => {
    mockQuery.mockImplementation(() =>
      makeAsyncGen([{ type: 'result', subtype: 'success' }])(),
    );

    const resultContent = 'Task completed successfully.';
    await fs.writeFile(path.join(tmpDir, 'RESULT.md'), resultContent, 'utf-8');

    const store = makeMockStore();
    const executor = new TaskExecutor(store as never);
    const result = await executor.executeTask('test', tmpDir, 'run-5');

    expect(result.resultText).toBe(resultContent);
  });

  it('returns empty resultText when RESULT.md does not exist', async () => {
    mockQuery.mockImplementation(() =>
      makeAsyncGen([{ type: 'result', subtype: 'success' }])(),
    );

    const store = makeMockStore();
    const executor = new TaskExecutor(store as never);
    const result = await executor.executeTask('test', tmpDir, 'run-6');

    expect(result.resultText).toBe('');
  });

  it('purgeRunDir is called before query starts', async () => {
    const callOrder: string[] = [];

    const store = makeMockStore();
    store.purgeRunDir.mockImplementation(async () => {
      callOrder.push('purge');
    });

    mockQuery.mockImplementation(() => {
      callOrder.push('query');
      return makeAsyncGen([{ type: 'result', subtype: 'success' }])();
    });

    const executor = new TaskExecutor(store as never);
    await executor.executeTask('test', tmpDir, 'run-7');

    expect(callOrder[0]).toBe('purge');
    expect(callOrder[1]).toBe('query');
    expect(store.purgeRunDir).toHaveBeenCalledWith('run-7');
  });
});
