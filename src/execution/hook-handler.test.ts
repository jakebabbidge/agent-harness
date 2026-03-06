import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hookScriptPath = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'docker',
  'hook-handler.mjs',
);

function runHook(
  stdinData: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [hookScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        exitCode: code ?? 1,
      });
    });

    child.stdin.write(stdinData);
    child.stdin.end();
  });
}

describe('hook-handler: non-AskUserQuestion tools', () => {
  it('should exit 0 with no output for non-question tools', async () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
    });

    const { stdout, exitCode } = await runHook(input);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('');
  });
});

describe('hook-handler: invalid input', () => {
  it('should exit 0 with no output for invalid JSON', async () => {
    const { stdout, exitCode } = await runHook('not json at all');

    expect(exitCode).toBe(0);
    expect(stdout).toBe('');
  });

  it('should exit 0 with no output for empty stdin', async () => {
    const { stdout, exitCode } = await runHook('');

    expect(exitCode).toBe(0);
    expect(stdout).toBe('');
  });
});

describe('hook-handler: AskUserQuestion', () => {
  const ipcDir = '/tmp/output';

  afterEach(async () => {
    // Cleanup any leftover IPC files
    try {
      const files = await readdir(ipcDir);
      for (const f of files) {
        if (f.startsWith('question-') || f.startsWith('answer-')) {
          await rm(join(ipcDir, f), { force: true });
        }
      }
    } catch {
      // ignore
    }
  });

  it('should write question file to IPC dir and return answer', async () => {
    const { mkdirSync, existsSync } = await import('node:fs');
    if (!existsSync(ipcDir)) {
      mkdirSync(ipcDir, { recursive: true });
    }

    const questions = [
      {
        question: 'Pick a number?',
        options: [{ label: '1' }, { label: '2' }],
      },
    ];

    const input = JSON.stringify({
      tool_name: 'AskUserQuestion',
      tool_input: { questions },
    });

    // Start the hook (it will block polling for an answer)
    const hookPromise = runHook(input);

    // Wait for the question file to appear
    await new Promise((resolve) => setTimeout(resolve, 200));

    const files = await readdir(ipcDir);
    const questionFile = files.find(
      (f) => f.startsWith('question-') && f.endsWith('.json'),
    );
    expect(questionFile).toBeDefined();

    // Read the question to get the ID
    const questionData = JSON.parse(
      await readFile(join(ipcDir, questionFile!), 'utf-8'),
    );
    expect(questionData.questions).toEqual(questions);

    // Write the answer file
    const answerId = questionData.id;
    await writeFile(
      join(ipcDir, `answer-${answerId}.json`),
      JSON.stringify({ id: answerId, answers: { 'Pick a number?': '1' } }),
    );

    // Wait for hook to pick up the answer
    const { stdout, exitCode } = await hookPromise;
    const result = JSON.parse(stdout);

    expect(exitCode).toBe(0);
    expect(result.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(result.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput.permissionDecisionReason).toContain(
      'Pick a number?',
    );
    expect(result.hookSpecificOutput.permissionDecisionReason).toContain(
      'A: 1',
    );
  });
});
