import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  pollForQuestions,
  writeAnswer,
  cleanupIpcFiles,
  type Question,
} from './ipc.js';

let testDir: string;

afterEach(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  }
});

async function createTestDir(): Promise<string> {
  testDir = await mkdtemp(join(tmpdir(), 'ipc-test-'));
  return testDir;
}

describe('writeAnswer', () => {
  it('should write an answer file atomically', async () => {
    const dir = await createTestDir();
    const answer = { id: 'test-123', answers: { 'What color?': 'Blue' } };

    await writeAnswer(dir, answer);

    const raw = await readFile(join(dir, 'answer-test-123.json'), 'utf-8');
    expect(JSON.parse(raw)).toEqual(answer);
  });

  it('should not leave .tmp files after write', async () => {
    const dir = await createTestDir();
    await writeAnswer(dir, { id: 'abc', answers: { Q: 'A' } });

    const files = await readdir(dir);
    expect(files).not.toContain('answer-abc.json.tmp');
    expect(files).toContain('answer-abc.json');
  });
});

describe('pollForQuestions', () => {
  it('should yield questions as they appear', async () => {
    const dir = await createTestDir();
    const abortController = new AbortController();

    const question: Question = {
      id: 'q1',
      questions: [{ question: 'Pick one?', options: [{ label: 'A' }] }],
    };

    // Write question file after a short delay
    setTimeout(async () => {
      await writeFile(join(dir, 'question-q1.json'), JSON.stringify(question));
      // Give time for poll to pick it up, then abort
      setTimeout(() => abortController.abort(), 500);
    }, 100);

    const results: Question[] = [];
    for await (const q of pollForQuestions(dir, abortController.signal)) {
      results.push(q);
    }

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('q1');
    expect(results[0].questions[0].question).toBe('Pick one?');
  });

  it('should not yield the same question twice', async () => {
    const dir = await createTestDir();
    const abortController = new AbortController();

    const question: Question = {
      id: 'q2',
      questions: [{ question: 'Again?' }],
    };
    await writeFile(join(dir, 'question-q2.json'), JSON.stringify(question));

    // Abort after enough time for two poll cycles
    setTimeout(() => abortController.abort(), 800);

    const results: Question[] = [];
    for await (const q of pollForQuestions(dir, abortController.signal)) {
      results.push(q);
    }

    expect(results).toHaveLength(1);
  });

  it('should ignore non-question files', async () => {
    const dir = await createTestDir();
    const abortController = new AbortController();

    await writeFile(join(dir, 'answer-x.json'), '{}');
    await writeFile(join(dir, 'other-file.txt'), 'hello');

    setTimeout(() => abortController.abort(), 500);

    const results: Question[] = [];
    for await (const q of pollForQuestions(dir, abortController.signal)) {
      results.push(q);
    }

    expect(results).toHaveLength(0);
  });
});

describe('cleanupIpcFiles', () => {
  it('should remove question and answer files', async () => {
    const dir = await createTestDir();

    await writeFile(join(dir, 'question-1.json'), '{}');
    await writeFile(join(dir, 'answer-1.json'), '{}');
    await writeFile(join(dir, 'question-2.json.tmp'), '{}');
    await writeFile(join(dir, 'other.txt'), 'keep');

    await cleanupIpcFiles(dir);

    const files = await readdir(dir);
    expect(files).toEqual(['other.txt']);
  });

  it('should not throw for non-existent directory', async () => {
    await expect(
      cleanupIpcFiles('/tmp/nonexistent-dir-xyz'),
    ).resolves.toBeUndefined();
  });
});
