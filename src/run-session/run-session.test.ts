import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunResult } from '../execution/container-lifecycle.js';
import type { QuestionMessage } from '../messages.js';

vi.mock('../execution/container-lifecycle.js', () => ({
  executeRun: vi.fn(),
}));

import { executeRun } from '../execution/container-lifecycle.js';
import { RunSession } from './run-session.js';

const mockExecuteRun = vi.mocked(executeRun);

function makeResult(overrides?: Partial<RunResult>): RunResult {
  return {
    output: 'done',
    stderr: '',
    exitCode: 0,
    ...overrides,
  };
}

describe('RunSession', () => {
  let session: RunSession;

  beforeEach(() => {
    vi.clearAllMocks();
    session = new RunSession();
  });

  it('should transition through pending → running → completed', async () => {
    const statuses: string[] = [];
    session.on('executionUpdated', (exec) => {
      statuses.push(exec.status);
    });

    mockExecuteRun.mockResolvedValue(makeResult());

    await session.addExecution('e1', 'test-run', 'prompt text');

    expect(statuses).toEqual(['running', 'completed']);
    expect(session.getExecution('e1')?.status).toBe('completed');
  });

  it('should transition to failed on error', async () => {
    const statuses: string[] = [];
    session.on('executionUpdated', (exec) => {
      statuses.push(exec.status);
    });

    mockExecuteRun.mockRejectedValue(new Error('docker not found'));

    await expect(
      session.addExecution('e1', 'test-run', 'prompt text'),
    ).rejects.toThrow('docker not found');

    expect(statuses).toEqual(['running', 'failed']);
    expect(session.getExecution('e1')?.status).toBe('failed');
    expect(session.getExecution('e1')?.error).toBe('docker not found');
  });

  it('should emit executionAdded when adding an execution', async () => {
    const added: string[] = [];
    session.on('executionAdded', (exec) => {
      added.push(exec.id);
    });

    mockExecuteRun.mockResolvedValue(makeResult());
    await session.addExecution('e1', 'test-run', 'prompt');

    expect(added).toEqual(['e1']);
  });

  it('should emit sessionCompleted when all executions finish', async () => {
    const completed = vi.fn();
    session.on('sessionCompleted', completed);

    mockExecuteRun.mockResolvedValue(makeResult());
    await session.addExecution('e1', 'test-run', 'prompt');

    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('should accumulate messages from onMessage callback', async () => {
    mockExecuteRun.mockImplementation(
      async (_prompt, _onQuestion, onMessage) => {
        onMessage!({ type: 'thinking', content: 'hmm' });
        onMessage!({ type: 'text', content: 'hello' });
        onMessage!({ type: 'tool_use', name: 'read', input: {} });
        return makeResult();
      },
    );

    await session.addExecution('e1', 'test-run', 'prompt');

    const exec = session.getExecution('e1')!;
    expect(exec.messages).toHaveLength(3);
    expect(exec.messages[0].type).toBe('thinking');
    expect(exec.messages[1].type).toBe('text');
    expect(exec.messages[2].type).toBe('tool_use');
  });

  it('should handle question flow: block → answer → resume', async () => {
    const statuses: string[] = [];
    session.on('executionUpdated', (exec) => {
      statuses.push(exec.status);
    });

    const questionMsg: QuestionMessage = {
      type: 'question',
      id: 'q1',
      questions: [{ question: 'Pick one', options: [{ label: 'A' }] }],
    };

    mockExecuteRun.mockImplementation(
      async (_prompt, onQuestion, onMessage) => {
        onMessage!({ type: 'thinking', content: 'working' });
        const answer = await onQuestion!(questionMsg);
        expect(answer.id).toBe('q1');
        expect(answer.answers['Pick one']).toBe('A');
        onMessage!({ type: 'text', content: 'continuing' });
        return makeResult();
      },
    );

    // Start the execution (will block on question)
    const resultPromise = session.addExecution('e1', 'test-run', 'prompt');

    // Wait a tick for the question to be registered
    await new Promise((r) => setTimeout(r, 10));

    // Verify blocked state
    expect(session.getExecution('e1')?.status).toBe('blocked');
    expect(session.getExecution('e1')?.pendingQuestion).toEqual(questionMsg);

    // Answer the question
    session.answerQuestion('e1', { 'Pick one': 'A' });

    const result = await resultPromise;
    expect(result.exitCode).toBe(0);
    expect(session.getExecution('e1')?.status).toBe('completed');
    expect(session.getExecution('e1')?.pendingQuestion).toBeNull();
  });

  it('should throw when answering a non-existent question', () => {
    expect(() => session.answerQuestion('nope', {})).toThrow(
      'No pending question',
    );
  });

  it('should return executions from getExecutions()', async () => {
    mockExecuteRun.mockResolvedValue(makeResult());
    await session.addExecution('e1', 'run-1', 'prompt');

    const execs = session.getExecutions();
    expect(execs).toHaveLength(1);
    expect(execs[0].id).toBe('e1');
    expect(execs[0].label).toBe('run-1');
  });

  it('should store the RunResult on completion', async () => {
    const result = makeResult({ output: 'my output', rawLogPath: '/tmp/log' });
    mockExecuteRun.mockResolvedValue(result);

    await session.addExecution('e1', 'run-1', 'prompt');

    expect(session.getExecution('e1')?.result).toEqual(result);
  });
});
