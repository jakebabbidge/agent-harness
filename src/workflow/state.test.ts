import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createStateManager } from './state.js';
import type { WorkflowRunState } from '../types/index.js';

let tmpDir: string;
let stateManager: ReturnType<typeof createStateManager>;

const makeSampleState = (runId: string): WorkflowRunState => ({
  runId,
  workflowPath: '/test/workflow.yaml',
  workflowDef: {
    version: '1.0',
    nodes: [{ id: 'n1', template: 't.hbs', repo: '/repo' }],
    edges: [],
  },
  status: 'running',
  startedAt: new Date().toISOString(),
  nodeStates: {
    n1: { status: 'pending' },
  },
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'state-test-'));
  stateManager = createStateManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('state persistence', () => {
  it('round-trips save and load', async () => {
    const state = makeSampleState('run-1');
    await stateManager.saveRunState(state);
    const loaded = await stateManager.loadRunState('run-1');
    expect(loaded).toEqual(state);
  });

  it('returns null for non-existent runId', async () => {
    const loaded = await stateManager.loadRunState('does-not-exist');
    expect(loaded).toBeNull();
  });

  it('creates directory if missing', async () => {
    const nestedDir = path.join(tmpDir, 'deep', 'nested');
    const mgr = createStateManager(nestedDir);
    const state = makeSampleState('run-2');
    await mgr.saveRunState(state);
    const loaded = await mgr.loadRunState('run-2');
    expect(loaded).toEqual(state);
  });
});
