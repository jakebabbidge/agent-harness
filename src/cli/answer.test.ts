import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { answerCommand } from './answer.js';
import type { QuestionRecord } from '../types/index.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'answer-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('answerCommand with --path', () => {
  it('writes answer.json to <path>/.harness/answer.json', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    await fs.mkdir(harnessDir, { recursive: true });

    const question: QuestionRecord = {
      runId: 'test-run',
      questions: [{ question: 'What color?' }],
      timestamp: new Date().toISOString(),
    };
    await fs.writeFile(path.join(harnessDir, 'question.json'), JSON.stringify(question));

    await answerCommand('test-run', 'blue', { path: tmpDir });

    const answerPath = path.join(harnessDir, 'answer.json');
    const raw = await fs.readFile(answerPath, 'utf-8');
    const answer = JSON.parse(raw);
    expect(answer.answers).toBeDefined();
    expect(answer.answeredAt).toBeDefined();
  });

  it('fails if no question.json exists at <path>/.harness/', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    await fs.mkdir(harnessDir, { recursive: true });
    // No question.json written

    await expect(
      answerCommand('test-run', 'answer', { path: tmpDir }),
    ).rejects.toThrow();
  });

  it('writes correct AnswerRecord shape when question exists', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    await fs.mkdir(harnessDir, { recursive: true });

    const question: QuestionRecord = {
      runId: 'run-shape',
      questions: [{ question: 'Ready?' }, { question: 'Sure?' }],
      timestamp: new Date().toISOString(),
    };
    await fs.writeFile(path.join(harnessDir, 'question.json'), JSON.stringify(question));

    await answerCommand('run-shape', 'yes', { path: tmpDir });

    const raw = await fs.readFile(path.join(harnessDir, 'answer.json'), 'utf-8');
    const answer = JSON.parse(raw);
    expect(answer.runId).toBeDefined();
    expect(answer.answers['Ready?']).toBe('yes');
    expect(answer.answers['Sure?']).toBe('yes');
    expect(answer.answeredAt).toBeDefined();
  });
});
