import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { QuestionRecord, AnswerRecord } from '../types/index.js';

export class QuestionStore {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(os.tmpdir(), 'agent-harness', 'runs');
  }

  runDir(runId: string): string {
    return path.join(this.baseDir, runId);
  }

  async askAndWait(
    runId: string,
    input: { questions: unknown[] },
  ): Promise<Record<string, string>> {
    const dir = this.runDir(runId);
    await fs.mkdir(dir, { recursive: true });

    const questionRecord: QuestionRecord = {
      runId,
      questions: input.questions as QuestionRecord['questions'],
      timestamp: new Date().toISOString(),
    };

    await fs.writeFile(
      path.join(dir, 'question.json'),
      JSON.stringify(questionRecord, null, 2),
    );

    console.log(`[agent-harness] Agent asking question for run ${runId}`);

    // Poll for answer.json
    const answerPath = path.join(dir, 'answer.json');
    while (true) {
      await new Promise<void>((r) => setTimeout(r, 500));
      try {
        const raw = await fs.readFile(answerPath, 'utf-8');
        const record: AnswerRecord = JSON.parse(raw);
        await fs.unlink(answerPath);
        return record.answers;
      } catch {
        // answer.json not yet present — keep polling
      }
    }
  }

  async submitAnswer(runId: string, answers: Record<string, string>): Promise<void> {
    const dir = this.runDir(runId);
    const questionPath = path.join(dir, 'question.json');

    // Verify a question exists
    try {
      await fs.access(questionPath);
    } catch {
      throw new Error(
        `No question.json found for run ${runId} — cannot submit answer without an active question`,
      );
    }

    const answerRecord: AnswerRecord = {
      runId,
      answers,
      answeredAt: new Date().toISOString(),
    };

    await fs.writeFile(
      path.join(dir, 'answer.json'),
      JSON.stringify(answerRecord, null, 2),
    );
  }

  async getQuestion(runId: string): Promise<QuestionRecord | null> {
    const questionPath = path.join(this.runDir(runId), 'question.json');
    try {
      const raw = await fs.readFile(questionPath, 'utf-8');
      return JSON.parse(raw) as QuestionRecord;
    } catch {
      return null;
    }
  }

  async purgeRunDir(runId: string): Promise<void> {
    await fs.rm(this.runDir(runId), { recursive: true, force: true });
  }
}
