import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BranchTracker } from './tracker.js';
import type { WorktreeInfo } from '../types/index.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

function makeInfo(taskId: string): WorktreeInfo {
  return {
    taskId,
    worktreePath: `/tmp/worktrees/${taskId}`,
    branchName: `agent-harness/task-${taskId}`,
    baseBranch: 'main',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

describe('BranchTracker (in-memory)', () => {
  let tracker: BranchTracker;

  beforeEach(() => {
    tracker = new BranchTracker();
  });

  it('register and getBranch returns branch name', () => {
    const info = makeInfo('task-abc');
    tracker.register(info);
    expect(tracker.getBranch('task-abc')).toBe('agent-harness/task-task-abc');
  });

  it('getBranch returns undefined for unregistered task', () => {
    expect(tracker.getBranch('nonexistent')).toBeUndefined();
  });

  it('getAll returns all registered entries', () => {
    const infoA = makeInfo('a');
    const infoB = makeInfo('b');
    tracker.register(infoA);
    tracker.register(infoB);
    const all = tracker.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.taskId)).toContain('a');
    expect(all.map((e) => e.taskId)).toContain('b');
  });

  it('unregister removes the entry', () => {
    const info = makeInfo('task-xyz');
    tracker.register(info);
    tracker.unregister('task-xyz');
    expect(tracker.getBranch('task-xyz')).toBeUndefined();
    expect(tracker.getAll()).toHaveLength(0);
  });

  it('unregister on non-existent task is a no-op', () => {
    // Should not throw
    expect(() => tracker.unregister('ghost')).not.toThrow();
  });
});

describe('BranchTracker (persistence)', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), crypto.randomUUID());
    await fs.mkdir(tmpDir, { recursive: true });
    statePath = path.join(tmpDir, 'tracker-state.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('persists state to disk on register and recovers after simulated restart', async () => {
    const tracker1 = new BranchTracker(statePath);
    const info = makeInfo('persist-task');
    tracker1.register(info);
    // save() is called internally on mutation — wait briefly to ensure async write
    await new Promise((r) => setTimeout(r, 50));

    // Simulate restart: new instance loads from state file
    const tracker2 = new BranchTracker(statePath);
    await tracker2.load();
    expect(tracker2.getBranch('persist-task')).toBe('agent-harness/task-persist-task');
  });

  it('persists state to disk on unregister', async () => {
    const tracker1 = new BranchTracker(statePath);
    tracker1.register(makeInfo('task-will-be-removed'));
    tracker1.register(makeInfo('task-stays'));
    await new Promise((r) => setTimeout(r, 50));

    tracker1.unregister('task-will-be-removed');
    await new Promise((r) => setTimeout(r, 50));

    const tracker2 = new BranchTracker(statePath);
    await tracker2.load();
    expect(tracker2.getBranch('task-will-be-removed')).toBeUndefined();
    expect(tracker2.getBranch('task-stays')).toBe('agent-harness/task-task-stays');
  });

  it('load() is safe when state file does not exist', async () => {
    const tracker = new BranchTracker(path.join(tmpDir, 'nonexistent.json'));
    await expect(tracker.load()).resolves.not.toThrow();
    expect(tracker.getAll()).toHaveLength(0);
  });
});
