import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock renderTemplate before importing runner
vi.mock('../template/renderer.js', () => ({
  renderTemplate: vi.fn(),
}));

import { renderTemplate } from '../template/renderer.js';
import { runWorkflow } from './runner.js';
import type { WorkflowDef } from '../types/index.js';

// Helper to make a mock executor
function makeMockExecutor(results: Array<{ exitCode: number; resultText: string }>) {
  const calls: string[] = [];
  let callIndex = 0;
  const executeTask = vi.fn().mockImplementation(async (prompt: string, _repo: string, _runId: string) => {
    calls.push(prompt);
    const result = results[callIndex] ?? { exitCode: 0, resultText: '' };
    callIndex++;
    return result;
  });
  return { executeTask, calls };
}

// Helper to set up renderTemplate mock
const mockRenderTemplate = vi.mocked(renderTemplate);

function setupRenderMock() {
  mockRenderTemplate.mockImplementation(async (templatePath: string, variables?: Record<string, unknown>) => ({
    rendered: `rendered-prompt-for-${templatePath}`,
    templatePath,
    partialPaths: [],
    variables: variables ?? {},
  }));
}

describe('WorkflowRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupRenderMock();
  });

  const singleNodeWorkflow: WorkflowDef = {
    version: '1.0',
    nodes: [{ id: 'node-1', template: 'templates/task.hbs', repo: '/repo/a', variables: {} }],
    edges: [],
  };

  const multiNodeWorkflow: WorkflowDef = {
    version: '1.0',
    nodes: [
      { id: 'node-1', template: 'templates/task1.hbs', repo: '/repo/a', variables: {} },
      { id: 'node-2', template: 'templates/task2.hbs', repo: '/repo/b', variables: {} },
    ],
    edges: [{ from: 'node-1', to: 'node-2' }],
  };

  it('single-node workflow calls executor once and returns success', async () => {
    const mock = makeMockExecutor([{ exitCode: 0, resultText: 'done' }]);
    const result = await runWorkflow(singleNodeWorkflow, mock as never);

    expect(mock.executeTask).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('success');
    expect(result.nodeResults).toHaveLength(1);
    expect(result.nodeResults[0].nodeId).toBe('node-1');
  });

  it('multi-node workflow calls executor for each node in order', async () => {
    const mock = makeMockExecutor([
      { exitCode: 0, resultText: 'a' },
      { exitCode: 0, resultText: 'b' },
    ]);
    const result = await runWorkflow(multiNodeWorkflow, mock as never);

    expect(mock.executeTask).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('success');
    expect(result.nodeResults).toHaveLength(2);
    expect(result.nodeResults[0].nodeId).toBe('node-1');
    expect(result.nodeResults[1].nodeId).toBe('node-2');
  });

  it('executor receives rendered template text, not raw template path', async () => {
    const mock = makeMockExecutor([{ exitCode: 0, resultText: '' }]);
    await runWorkflow(singleNodeWorkflow, mock as never);

    const [calledPrompt] = mock.executeTask.mock.calls[0] as [string, ...unknown[]];
    expect(calledPrompt).toBe('rendered-prompt-for-templates/task.hbs');
    expect(mockRenderTemplate).toHaveBeenCalledWith('templates/task.hbs', {});
  });

  it('first node failure stops execution — second node is NOT called', async () => {
    const mock = makeMockExecutor([
      { exitCode: 1, resultText: 'error' },
      { exitCode: 0, resultText: 'ok' },
    ]);
    const result = await runWorkflow(multiNodeWorkflow, mock as never);

    expect(mock.executeTask).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('failed');
  });

  it('failure result includes correct failedNodeId', async () => {
    const mock = makeMockExecutor([{ exitCode: 1, resultText: 'error' }]);
    const result = await runWorkflow(singleNodeWorkflow, mock as never);

    expect(result.status).toBe('failed');
    expect(result.failedNodeId).toBe('node-1');
  });

  it('all node results are collected in nodeResults array', async () => {
    const mock = makeMockExecutor([
      { exitCode: 0, resultText: 'first done' },
      { exitCode: 0, resultText: 'second done' },
    ]);
    const result = await runWorkflow(multiNodeWorkflow, mock as never);

    expect(result.nodeResults).toHaveLength(2);
    expect(result.nodeResults[0].result.resultText).toBe('first done');
    expect(result.nodeResults[1].result.resultText).toBe('second done');
  });

  it('each node gets a unique runId in UUID format', async () => {
    const capturedRunIds: string[] = [];
    const mockExecutor = {
      executeTask: vi.fn().mockImplementation(
        async (_prompt: string, _repo: string, runId: string) => {
          capturedRunIds.push(runId);
          return { exitCode: 0, resultText: '' };
        },
      ),
    };

    await runWorkflow(multiNodeWorkflow, mockExecutor as never);

    expect(capturedRunIds).toHaveLength(2);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(capturedRunIds[0]).toMatch(uuidPattern);
    expect(capturedRunIds[1]).toMatch(uuidPattern);
    expect(capturedRunIds[0]).not.toBe(capturedRunIds[1]);
  });
});
