import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { QuestionStore } from './question-store.js';
import type { QuestionRecord } from '../types/index.js';

let tmpDir: string;
let store: QuestionStore;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qs-test-'));
  store = new QuestionStore(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('QuestionStore', () => {
  describe('getQuestion', () => {
    it('returns null when no question.json exists', async () => {
      const result = await store.getQuestion('run-001');
      expect(result).toBeNull();
    });

    it('returns parsed QuestionRecord when question.json exists', async () => {
      const runId = 'run-002';
      const runDir = path.join(tmpDir, runId);
      await fs.mkdir(runDir, { recursive: true });
      const record: QuestionRecord = {
        runId,
        questions: [{ question: 'What is your name?' }],
        timestamp: new Date().toISOString(),
      };
      await fs.writeFile(path.join(runDir, 'question.json'), JSON.stringify(record));

      const result = await store.getQuestion(runId);
      expect(result).not.toBeNull();
      expect(result!.runId).toBe(runId);
      expect(result!.questions[0].question).toBe('What is your name?');
    });
  });

  describe('submitAnswer', () => {
    it('throws if no question.json exists', async () => {
      await expect(store.submitAnswer('no-question-run', { '0': 'answer' })).rejects.toThrow();
    });

    it('writes answer.json when question exists', async () => {
      const runId = 'run-003';
      const runDir = path.join(tmpDir, runId);
      await fs.mkdir(runDir, { recursive: true });
      const record: QuestionRecord = {
        runId,
        questions: [{ question: 'Are you ready?' }],
        timestamp: new Date().toISOString(),
      };
      await fs.writeFile(path.join(runDir, 'question.json'), JSON.stringify(record));

      await store.submitAnswer(runId, { '0': 'yes' });

      const answerPath = path.join(runDir, 'answer.json');
      const answerRaw = await fs.readFile(answerPath, 'utf-8');
      const answer = JSON.parse(answerRaw);
      expect(answer.runId).toBe(runId);
      expect(answer.answers['0']).toBe('yes');
      expect(answer.answeredAt).toBeDefined();
    });
  });

  describe('askAndWait', () => {
    it('writes question.json, resolves when answer.json appears, and deletes answer.json', async () => {
      const runId = 'run-004';

      // Start askAndWait and submit answer after a short delay
      const waitPromise = store.askAndWait(runId, {
        questions: [{ question: 'What color?' }],
      });

      // Give askAndWait time to write question.json and start polling
      await new Promise((r) => setTimeout(r, 200));

      // Verify question.json was written
      const runDir = path.join(tmpDir, runId);
      const questionPath = path.join(runDir, 'question.json');
      const questionRaw = await fs.readFile(questionPath, 'utf-8');
      const question = JSON.parse(questionRaw);
      expect(question.runId).toBe(runId);

      // Submit the answer
      await store.submitAnswer(runId, { '0': 'blue' });

      // Wait for askAndWait to resolve
      const answers = await waitPromise;
      expect(answers['0']).toBe('blue');

      // answer.json should be deleted (consumed)
      const answerPath = path.join(runDir, 'answer.json');
      await expect(fs.access(answerPath)).rejects.toThrow();
    });

    it('creates run directory if it does not exist', async () => {
      const runId = 'brand-new-run';
      const runDir = path.join(tmpDir, runId);

      // Directory should not exist yet
      await expect(fs.access(runDir)).rejects.toThrow();

      const waitPromise = store.askAndWait(runId, {
        questions: [{ question: 'Test?' }],
      });

      // Wait for directory creation and question write
      await new Promise((r) => setTimeout(r, 200));

      // Directory should now exist
      await expect(fs.access(runDir)).resolves.toBeUndefined();

      // Submit answer to unblock
      await store.submitAnswer(runId, { '0': 'yes' });
      await waitPromise;
    });
  });

  describe('forWorktree', () => {
    it('runDir returns <worktreePath>/.harness regardless of runId', async () => {
      const wtStore = QuestionStore.forWorktree(tmpDir);
      expect(wtStore.runDir('any-id')).toBe(path.join(tmpDir, '.harness'));
      expect(wtStore.runDir('other-id')).toBe(path.join(tmpDir, '.harness'));
    });

    it('submitAnswer writes answer.json to flat .harness dir', async () => {
      const harnessDir = path.join(tmpDir, '.harness');
      await fs.mkdir(harnessDir, { recursive: true });

      // Write question.json so submitAnswer doesn't throw
      const question: QuestionRecord = {
        runId: 'ignored',
        questions: [{ question: 'Test?' }],
        timestamp: new Date().toISOString(),
      };
      await fs.writeFile(path.join(harnessDir, 'question.json'), JSON.stringify(question));

      const wtStore = QuestionStore.forWorktree(tmpDir);
      await wtStore.submitAnswer('ignored', { '0': 'yes' });

      const answerPath = path.join(harnessDir, 'answer.json');
      const raw = await fs.readFile(answerPath, 'utf-8');
      const answer = JSON.parse(raw);
      expect(answer.answers['0']).toBe('yes');
    });

    it('getQuestion reads question.json from flat .harness dir', async () => {
      const harnessDir = path.join(tmpDir, '.harness');
      await fs.mkdir(harnessDir, { recursive: true });

      const question: QuestionRecord = {
        runId: 'test-run',
        questions: [{ question: 'Color?' }],
        timestamp: new Date().toISOString(),
      };
      await fs.writeFile(path.join(harnessDir, 'question.json'), JSON.stringify(question));

      const wtStore = QuestionStore.forWorktree(tmpDir);
      const result = await wtStore.getQuestion('any-run-id');
      expect(result).not.toBeNull();
      expect(result!.questions[0].question).toBe('Color?');
    });
  });

  describe('purgeRunDir', () => {
    it('removes the run directory', async () => {
      const runId = 'run-purge';
      const runDir = path.join(tmpDir, runId);
      await fs.mkdir(runDir, { recursive: true });
      await fs.writeFile(path.join(runDir, 'question.json'), '{}');

      await store.purgeRunDir(runId);

      await expect(fs.access(runDir)).rejects.toThrow();
    });

    it('does not throw if run directory does not exist', async () => {
      await expect(store.purgeRunDir('nonexistent-run')).resolves.toBeUndefined();
    });
  });
});
