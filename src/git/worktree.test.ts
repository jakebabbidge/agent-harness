import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWorktree, removeWorktree } from './worktree.js';
import { BranchTracker } from './tracker.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function initRepo(dir: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  // Need at least one commit for branches to work
  const dummyFile = path.join(dir, 'README.md');
  await fs.writeFile(dummyFile, '# test repo\n');
  await execFileAsync('git', ['add', '.'], { cwd: dir });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: dir });
}

describe('createWorktree', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), crypto.randomUUID());
    await fs.mkdir(tmpDir, { recursive: true });
    await initRepo(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a worktree at the expected path', async () => {
    const info = await createWorktree(tmpDir, 'task-001', 'main');
    const expectedPath = path.join(tmpDir, '.worktrees', 'task-001');
    expect(info.worktreePath).toBe(expectedPath);
    const stat = await fs.stat(expectedPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it('branch name follows agent-harness/task-<taskId> convention', async () => {
    const info = await createWorktree(tmpDir, 'task-001', 'main');
    expect(info.branchName).toBe('agent-harness/task-task-001');
  });

  it('returns correct WorktreeInfo fields', async () => {
    const info = await createWorktree(tmpDir, 'task-abc', 'main');
    expect(info.taskId).toBe('task-abc');
    expect(info.baseBranch).toBe('main');
    expect(info.createdAt).toBeInstanceOf(Date);
  });

  it('two worktrees get different paths', async () => {
    const infoA = await createWorktree(tmpDir, 'task-A', 'main');
    const infoB = await createWorktree(tmpDir, 'task-B', 'main');
    expect(infoA.worktreePath).not.toBe(infoB.worktreePath);
  });

  it('writing a file in worktree A does not appear in worktree B (filesystem isolation)', async () => {
    const infoA = await createWorktree(tmpDir, 'iso-A', 'main');
    const infoB = await createWorktree(tmpDir, 'iso-B', 'main');

    const testFile = path.join(infoA.worktreePath, 'testfile.txt');
    await fs.writeFile(testFile, 'hello from A');

    const testFileInB = path.join(infoB.worktreePath, 'testfile.txt');
    await expect(fs.access(testFileInB)).rejects.toThrow();
  });

  it('registers with BranchTracker when tracker provided', async () => {
    const tracker = new BranchTracker();
    await createWorktree(tmpDir, 'task-tracked', 'main', tracker);
    expect(tracker.getBranch('task-tracked')).toBe('agent-harness/task-task-tracked');
  });

  it('does not require tracker (tracker is optional)', async () => {
    // Should not throw when no tracker provided
    await expect(createWorktree(tmpDir, 'task-no-tracker', 'main')).resolves.toBeDefined();
  });
});

describe('removeWorktree', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), crypto.randomUUID());
    await fs.mkdir(tmpDir, { recursive: true });
    await initRepo(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('removes the worktree directory', async () => {
    const info = await createWorktree(tmpDir, 'task-rm', 'main');
    await removeWorktree(tmpDir, 'task-rm');
    await expect(fs.access(info.worktreePath)).rejects.toThrow();
  });

  it('unregisters from BranchTracker when tracker provided', async () => {
    const tracker = new BranchTracker();
    await createWorktree(tmpDir, 'task-unreg', 'main', tracker);
    expect(tracker.getBranch('task-unreg')).toBeDefined();

    await removeWorktree(tmpDir, 'task-unreg', tracker);
    expect(tracker.getBranch('task-unreg')).toBeUndefined();
  });
});
