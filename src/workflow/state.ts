/**
 * Workflow run state persistence.
 * Saves and loads WorkflowRunState to/from JSON files on disk.
 * Uses atomic write (tmp + rename) to prevent corruption.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { WorkflowRunState } from '../types/index.js';

const DEFAULT_STATE_DIR = path.join(os.tmpdir(), 'agent-harness', 'workflows');

/**
 * Create a state manager scoped to a specific base directory.
 * Useful for testing with isolated directories.
 */
export function createStateManager(baseDir: string) {
  function getStatePath(runId: string): string {
    return path.join(baseDir, `${runId}.json`);
  }

  async function saveRunState(state: WorkflowRunState): Promise<void> {
    await fs.mkdir(baseDir, { recursive: true });
    const finalPath = getStatePath(state.runId);
    const tmpPath = `${finalPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    await fs.rename(tmpPath, finalPath);
  }

  async function loadRunState(runId: string): Promise<WorkflowRunState | null> {
    const filePath = getStatePath(runId);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as WorkflowRunState;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  return { saveRunState, loadRunState, getStatePath };
}

// Default convenience exports using the standard state directory
const defaultManager = createStateManager(DEFAULT_STATE_DIR);

export const saveRunState = defaultManager.saveRunState;
export const loadRunState = defaultManager.loadRunState;
export const getStatePath = defaultManager.getStatePath;
