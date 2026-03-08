import { readFile, writeFile } from 'node:fs/promises';
import { writeFileSync, readFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { query, type CanUseTool } from '@anthropic-ai/claude-agent-sdk';

const IPC_DIR = '/tmp/output';
const POLL_INTERVAL_MS = 500;
const TIMEOUT_MS = 5 * 60 * 1000;

function writeAtomic(filePath: string, data: string): void {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, filePath);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createCanUseTool(ipcDir: string): CanUseTool {
  return async (toolName, input) => {
    if (toolName !== 'AskUserQuestion') {
      return { behavior: 'allow' };
    }

    const questions =
      (input.questions as Array<{ question: string }>) ?? [];
    const id = randomUUID();

    const questionFile = join(ipcDir, `question-${id}.json`);
    writeAtomic(questionFile, JSON.stringify({ id, questions }));

    const answerFile = join(ipcDir, `answer-${id}.json`);
    const deadline = Date.now() + TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      if (existsSync(answerFile)) {
        const raw = readFileSync(answerFile, 'utf-8');
        const answer = JSON.parse(raw) as { answers: Record<string, string> };
        return {
          behavior: 'allow',
          updatedInput: { ...input, answers: answer.answers },
        };
      }
    }

    return { behavior: 'allow' };
  };
}

async function main(): Promise<void> {
  const promptFile = process.env['PROMPT_FILE'];
  const outputFile = process.env['OUTPUT_FILE'];

  if (!promptFile || !outputFile) {
    console.error(
      'PROMPT_FILE and OUTPUT_FILE environment variables are required',
    );
    process.exit(1);
  }

  const prompt = await readFile(promptFile, 'utf-8');

  let result = '';

  for await (const message of query({
    prompt,
    options: {
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      canUseTool: createCanUseTool(IPC_DIR),
    },
  })) {
    if ('result' in message) {
      result = message.result as string;
    }
  }

  await writeFile(outputFile, result, 'utf-8');
}

// Only run main when executed directly (not imported by tests)
const isDirectExecution = process.argv[1]?.endsWith('agent-runner.js');
if (isDirectExecution) {
  main().catch((err) => {
    console.error('agent-runner failed:', err);
    process.exit(1);
  });
}
