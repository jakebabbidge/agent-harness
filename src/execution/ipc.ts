import { readdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionItem {
  question: string;
  options?: QuestionOption[];
  header?: string;
  multiSelect?: boolean;
}

export interface Question {
  id: string;
  questions: QuestionItem[];
}

export interface QuestionAnswer {
  id: string;
  answers: Record<string, string>;
}

const POLL_INTERVAL_MS = 300;

export async function* pollForQuestions(
  dir: string,
  signal: AbortSignal,
): AsyncGenerator<Question> {
  const seen = new Set<string>();

  while (!signal.aborted) {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      files = [];
    }

    for (const file of files) {
      if (!file.startsWith('question-') || !file.endsWith('.json')) continue;
      if (seen.has(file)) continue;

      try {
        const raw = await readFile(join(dir, file), 'utf-8');
        const question: Question = JSON.parse(raw);
        seen.add(file);
        yield question;
      } catch {
        // File may be partially written; skip and retry next poll
      }
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, POLL_INTERVAL_MS);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

export async function writeAnswer(
  dir: string,
  answer: QuestionAnswer,
): Promise<void> {
  const filePath = join(dir, `answer-${answer.id}.json`);
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(answer), 'utf-8');
  await rename(tmpPath, filePath);
}

export async function cleanupIpcFiles(dir: string): Promise<void> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return;
  }

  for (const file of files) {
    if (
      (file.startsWith('question-') || file.startsWith('answer-')) &&
      (file.endsWith('.json') || file.endsWith('.json.tmp'))
    ) {
      await rm(join(dir, file), { force: true }).catch(() => {});
    }
  }
}
