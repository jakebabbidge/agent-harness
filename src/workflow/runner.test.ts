import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock renderTemplate before importing runner
vi.mock('../template/renderer.js', () => ({
  renderTemplate: vi.fn(),
}));

import { renderTemplate } from '../template/renderer.js';
import { runWorkflow } from './runner.js';
import { createStateManager } from './state.js';
import type { WorkflowDef, WorkflowRunState } from '../types/index.js';

// Helper to make a mock executor with optional per-node delays
function makeMockExecutor(
  results: Record<string, { exitCode: number; resultText: string; delay?: number }>,
) {
  const callOrder: string[] = [];
  const executeTask = vi.fn().mockImplementation(
    async (prompt: string, repo: string, _runId: string) => {
      // Derive nodeId from the rendered prompt pattern 'rendered-prompt-for-<template>'
      // We find which node matches by repo or prompt
      const nodeId = Object.keys(results).find(
        (id) => prompt.includes(id) || repo.includes(id),
      );
      const entry = nodeId ? results[nodeId] : { exitCode: 0, resultText: '' };
      if (entry.delay) {
        await new Promise((r) => setTimeout(r, entry.delay));
      }
      callOrder.push(nodeId ?? 'unknown');
      return { exitCode: entry.exitCode, resultText: entry.resultText };
    },
  );
  return { executeTask, callOrder };
}

// Helper to set up renderTemplate mock
const mockRenderTemplate = vi.mocked(renderTemplate);

function setupRenderMock() {
  mockRenderTemplate.mockImplementation(
    async (templatePath: string, variables?: Record<string, unknown>) => ({
      rendered: `rendered-prompt-for-${templatePath}`,
      templatePath,
      partialPaths: [],
      variables: variables ?? {},
    }),
  );
}

// State manager for tests
let tmpDir: string;
let stateManager: ReturnType<typeof createStateManager>;

describe('WorkflowRunner', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setupRenderMock();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runner-test-'));
    stateManager = createStateManager(tmpDir);
  });

  // --- Backward-compatible single-node test ---

  const singleNodeWorkflow: WorkflowDef = {
    version: '1.0',
    nodes: [
      { id: 'node-1', template: 'templates/node-1.hbs', repo: '/repo/node-1', variables: {} },
    ],
    edges: [],
  };

  it('single node workflow executes and returns success', async () => {
    const mock = makeMockExecutor({
      'node-1': { exitCode: 0, resultText: 'done' },
    });
    const result = await runWorkflow(singleNodeWorkflow, mock as never, {
      stateManager,
    });

    expect(mock.executeTask).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('success');
    expect(result.nodeResults).toHaveLength(1);
    expect(result.nodeResults[0].nodeId).toBe('node-1');
  });

  // --- Concurrency test ---

  it('two independent nodes execute concurrently', async () => {
    const workflow: WorkflowDef = {
      version: '1.0',
      nodes: [
        { id: 'A', template: 'templates/A.hbs', repo: '/repo/A', variables: {} },
        { id: 'B', template: 'templates/B.hbs', repo: '/repo/B', variables: {} },
      ],
      edges: [],
    };
    const mock = makeMockExecutor({
      A: { exitCode: 0, resultText: 'a', delay: 50 },
      B: { exitCode: 0, resultText: 'b', delay: 50 },
    });

    const start = Date.now();
    const result = await runWorkflow(workflow, mock as never, { stateManager });
    const elapsed = Date.now() - start;

    expect(result.status).toBe('success');
    expect(mock.executeTask).toHaveBeenCalledTimes(2);
    // Concurrent: ~50ms. Sequential would be ~100ms.
    expect(elapsed).toBeLessThan(150);
  });

  // --- Linear chain ---

  it('linear chain A->B executes in order', async () => {
    const workflow: WorkflowDef = {
      version: '1.0',
      nodes: [
        { id: 'A', template: 'templates/A.hbs', repo: '/repo/A', variables: {} },
        { id: 'B', template: 'templates/B.hbs', repo: '/repo/B', variables: {} },
      ],
      edges: [{ from: 'A', to: 'B' }],
    };
    const mock = makeMockExecutor({
      A: { exitCode: 0, resultText: 'a' },
      B: { exitCode: 0, resultText: 'b' },
    });

    const result = await runWorkflow(workflow, mock as never, { stateManager });

    expect(result.status).toBe('success');
    expect(mock.callOrder).toEqual(['A', 'B']);
  });

  // --- Diamond DAG ---

  it('diamond DAG executes correctly', async () => {
    const workflow: WorkflowDef = {
      version: '1.0',
      nodes: [
        { id: 'A', template: 'templates/A.hbs', repo: '/repo/A', variables: {} },
        { id: 'B', template: 'templates/B.hbs', repo: '/repo/B', variables: {} },
        { id: 'C', template: 'templates/C.hbs', repo: '/repo/C', variables: {} },
        { id: 'D', template: 'templates/D.hbs', repo: '/repo/D', variables: {} },
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'A', to: 'C' },
        { from: 'B', to: 'D' },
        { from: 'C', to: 'D' },
      ],
    };
    const mock = makeMockExecutor({
      A: { exitCode: 0, resultText: 'a' },
      B: { exitCode: 0, resultText: 'b' },
      C: { exitCode: 0, resultText: 'c' },
      D: { exitCode: 0, resultText: 'd' },
    });

    const result = await runWorkflow(workflow, mock as never, { stateManager });

    expect(result.status).toBe('success');
    expect(result.nodeResults).toHaveLength(4);
    // A must run before B, C, D; D must run after B and C
    const aIdx = mock.callOrder.indexOf('A');
    const bIdx = mock.callOrder.indexOf('B');
    const cIdx = mock.callOrder.indexOf('C');
    const dIdx = mock.callOrder.indexOf('D');
    expect(aIdx).toBeLessThan(bIdx);
    expect(aIdx).toBeLessThan(cIdx);
    expect(bIdx).toBeLessThan(dIdx);
    expect(cIdx).toBeLessThan(dIdx);
  });

  // --- Conditional edge: matching condition ---

  it('conditional edge: matching condition activates downstream', async () => {
    const workflow: WorkflowDef = {
      version: '1.0',
      nodes: [
        { id: 'A', template: 'templates/A.hbs', repo: '/repo/A', variables: {} },
        { id: 'B', template: 'templates/B.hbs', repo: '/repo/B', variables: {} },
      ],
      edges: [{ from: 'A', to: 'B', condition: { field: 'status', equals: 'ok' } }],
    };
    const mock = makeMockExecutor({
      A: { exitCode: 0, resultText: '{"status":"ok"}' },
      B: { exitCode: 0, resultText: 'b-done' },
    });

    const result = await runWorkflow(workflow, mock as never, { stateManager });

    expect(result.status).toBe('success');
    expect(mock.callOrder).toContain('B');
  });

  // --- Conditional edge: non-matching condition ---

  it('conditional edge: non-matching condition skips downstream', async () => {
    const workflow: WorkflowDef = {
      version: '1.0',
      nodes: [
        { id: 'A', template: 'templates/A.hbs', repo: '/repo/A', variables: {} },
        { id: 'B', template: 'templates/B.hbs', repo: '/repo/B', variables: {} },
      ],
      edges: [{ from: 'A', to: 'B', condition: { field: 'status', equals: 'ok' } }],
    };
    const mock = makeMockExecutor({
      A: { exitCode: 0, resultText: '{"status":"bad"}' },
      B: { exitCode: 0, resultText: 'b-done' },
    });

    const result = await runWorkflow(workflow, mock as never, { stateManager });

    expect(result.status).toBe('success');
    expect(mock.callOrder).not.toContain('B');
    expect(result.skippedNodeIds).toContain('B');
  });

  // --- Resume: skip completed nodes ---

  it('resume skips completed nodes', async () => {
    const workflow: WorkflowDef = {
      version: '1.0',
      nodes: [
        { id: 'A', template: 'templates/A.hbs', repo: '/repo/A', variables: {} },
        { id: 'B', template: 'templates/B.hbs', repo: '/repo/B', variables: {} },
      ],
      edges: [{ from: 'A', to: 'B' }],
    };
    const existingState: WorkflowRunState = {
      runId: 'resume-run-1',
      workflowPath: '/wf.yaml',
      workflowDef: workflow,
      status: 'interrupted',
      startedAt: new Date().toISOString(),
      nodeStates: {
        A: {
          status: 'completed',
          result: { exitCode: 0, resultText: '{"done":true}' },
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        B: { status: 'pending' },
      },
    };
    const mock = makeMockExecutor({
      A: { exitCode: 0, resultText: 'a' },
      B: { exitCode: 0, resultText: 'b' },
    });

    const result = await runWorkflow(workflow, mock as never, {
      state: existingState,
      runId: 'resume-run-1',
      stateManager,
    });

    expect(result.status).toBe('success');
    // A should NOT be called again
    expect(mock.callOrder).not.toContain('A');
    expect(mock.callOrder).toContain('B');
  });

  // --- Resume: running nodes treated as pending ---

  it('resume treats running nodes as pending', async () => {
    const workflow: WorkflowDef = {
      version: '1.0',
      nodes: [
        { id: 'A', template: 'templates/A.hbs', repo: '/repo/A', variables: {} },
      ],
      edges: [],
    };
    const existingState: WorkflowRunState = {
      runId: 'resume-run-2',
      workflowPath: '/wf.yaml',
      workflowDef: workflow,
      status: 'interrupted',
      startedAt: new Date().toISOString(),
      nodeStates: {
        A: { status: 'running', startedAt: new Date().toISOString() },
      },
    };
    const mock = makeMockExecutor({
      A: { exitCode: 0, resultText: 'a-rerun' },
    });

    const result = await runWorkflow(workflow, mock as never, {
      state: existingState,
      runId: 'resume-run-2',
      stateManager,
    });

    expect(result.status).toBe('success');
    expect(mock.callOrder).toContain('A');
  });

  // --- Node failure does not block independent branch ---

  it('node failure does not block independent branch', async () => {
    const workflow: WorkflowDef = {
      version: '1.0',
      nodes: [
        { id: 'A', template: 'templates/A.hbs', repo: '/repo/A', variables: {} },
        { id: 'B', template: 'templates/B.hbs', repo: '/repo/B', variables: {} },
      ],
      edges: [],
    };
    const mock = makeMockExecutor({
      A: { exitCode: 1, resultText: 'error' },
      B: { exitCode: 0, resultText: 'b-ok' },
    });

    const result = await runWorkflow(workflow, mock as never, { stateManager });

    // Both should run since they are independent
    expect(mock.executeTask).toHaveBeenCalledTimes(2);
    // Overall status is failed because A failed
    expect(result.status).toBe('failed');
    // B still ran
    expect(mock.callOrder).toContain('B');
  });

  // --- All node results collected ---

  it('all node results collected in WorkflowResult', async () => {
    const workflow: WorkflowDef = {
      version: '1.0',
      nodes: [
        { id: 'A', template: 'templates/A.hbs', repo: '/repo/A', variables: {} },
        { id: 'B', template: 'templates/B.hbs', repo: '/repo/B', variables: {} },
      ],
      edges: [{ from: 'A', to: 'B' }],
    };
    const mock = makeMockExecutor({
      A: { exitCode: 0, resultText: 'result-a' },
      B: { exitCode: 0, resultText: 'result-b' },
    });

    const result = await runWorkflow(workflow, mock as never, { stateManager });

    expect(result.nodeResults).toHaveLength(2);
    expect(result.nodeResults.find((r) => r.nodeId === 'A')?.result.resultText).toBe('result-a');
    expect(result.nodeResults.find((r) => r.nodeId === 'B')?.result.resultText).toBe('result-b');
  });
});
