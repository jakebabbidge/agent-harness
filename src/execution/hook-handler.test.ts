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

let testDir: string;

afterEach(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  }
});

function runHook(
  stdinData: string,
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [hookScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
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

describe('hook-handler: non-AskUserQuestion', () => {
  it('should return allow for Bash tool', async () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
    });

    const { stdout, exitCode } = await runHook(input);
    const result = JSON.parse(stdout);

    expect(exitCode).toBe(0);
    expect(result.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
    expect(result.hookSpecificOutput.decision.behavior).toBe('allow');
  });

  it('should return allow for Write tool', async () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { path: '/tmp/test.txt' },
    });

    const { stdout } = await runHook(input);
    const result = JSON.parse(stdout);

    expect(result.hookSpecificOutput.decision.behavior).toBe('allow');
  });
});

describe('hook-handler: invalid input', () => {
  it('should return fallback for invalid JSON', async () => {
    const { stdout } = await runHook('not json at all');
    const result = JSON.parse(stdout);

    expect(result.hookSpecificOutput.decision.behavior).toBe('ask');
  });

  it('should return fallback for empty stdin', async () => {
    const { stdout } = await runHook('');
    const result = JSON.parse(stdout);

    expect(result.hookSpecificOutput.decision.behavior).toBe('ask');
  });
});

describe('hook-handler: AskUserQuestion', () => {
  it('should write question file to IPC dir and return answer', async () => {
    // The hook script hardcodes /tmp/output as IPC_DIR.
    // To test, we create /tmp/output if needed, run the hook,
    // then check for question files and write an answer.
    const ipcDir = '/tmp/output';
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
    expect(result.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
    expect(result.hookSpecificOutput.decision.behavior).toBe('allow');
    expect(result.hookSpecificOutput.decision.updatedInput.answers).toEqual({
      'Pick a number?': '1',
    });
    expect(result.hookSpecificOutput.decision.updatedInput.questions).toEqual(
      questions,
    );

    // Cleanup
    await rm(join(ipcDir, questionFile!), { force: true });
    await rm(join(ipcDir, `answer-${answerId}.json`), { force: true });
  });
});
