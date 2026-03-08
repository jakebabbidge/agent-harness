import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCanUseTool } from './agent-runner.js';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const abortController = new AbortController();
const canUseToolOptions = {
  signal: abortController.signal,
  toolUseID: 'test-tool-use-id',
};

describe('createCanUseTool', () => {
  let ipcDir: string;

  beforeEach(async () => {
    ipcDir = await mkdtemp(join(tmpdir(), 'agent-runner-test-'));
  });

  afterEach(async () => {
    await rm(ipcDir, { recursive: true, force: true });
  });

  it('should write question file and return allow with updatedInput', async () => {
    const canUseTool = createCanUseTool(ipcDir);

    const questions = [{ question: 'Pick a color?' }];
    const resultPromise = canUseTool(
      'AskUserQuestion',
      { questions },
      canUseToolOptions,
    );

    // Wait for question file to appear
    await new Promise((resolve) => setTimeout(resolve, 100));

    const files = await readdir(ipcDir);
    const questionFile = files.find(
      (f) => f.startsWith('question-') && f.endsWith('.json'),
    );
    expect(questionFile).toBeDefined();

    const questionData = JSON.parse(
      readFileSync(join(ipcDir, questionFile!), 'utf-8'),
    );
    expect(questionData.questions).toEqual(questions);

    // Write the answer
    await writeFile(
      join(ipcDir, `answer-${questionData.id}.json`),
      JSON.stringify({ answers: { 'Pick a color?': 'blue' } }),
    );

    const result = await resultPromise;
    expect(result).toEqual({
      behavior: 'allow',
      updatedInput: {
        questions,
        answers: { 'Pick a color?': 'blue' },
      },
    });
  });

  it('should handle empty questions array', async () => {
    const canUseTool = createCanUseTool(ipcDir);

    const resultPromise = canUseTool(
      'AskUserQuestion',
      { questions: [] },
      canUseToolOptions,
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const files = await readdir(ipcDir);
    const questionFile = files.find(
      (f) => f.startsWith('question-') && f.endsWith('.json'),
    );
    expect(questionFile).toBeDefined();

    const questionData = JSON.parse(
      readFileSync(join(ipcDir, questionFile!), 'utf-8'),
    );

    await writeFile(
      join(ipcDir, `answer-${questionData.id}.json`),
      JSON.stringify({ answers: {} }),
    );

    const result = await resultPromise;
    expect(result).toEqual({
      behavior: 'allow',
      updatedInput: {
        questions: [],
        answers: {},
      },
    });
  });

  it('should auto-approve non-AskUserQuestion tools', async () => {
    const canUseTool = createCanUseTool(ipcDir);

    const result = await canUseTool(
      'Bash',
      { command: 'ls' },
      canUseToolOptions,
    );

    expect(result).toEqual({ behavior: 'allow' });

    // No IPC files should have been written
    const files = await readdir(ipcDir);
    expect(files).toHaveLength(0);
  });
});
