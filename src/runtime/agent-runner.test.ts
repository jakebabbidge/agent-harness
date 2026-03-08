import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAskUserQuestionHook } from './agent-runner.js';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { HookInput } from '@anthropic-ai/claude-agent-sdk';

function makeHookInput(questions: Array<{ question: string }>): HookInput {
  return {
    session_id: 'test-session',
    transcript_path: '/tmp/transcript',
    cwd: '/tmp',
    hook_event_name: 'PreToolUse',
    tool_name: 'AskUserQuestion',
    tool_input: { questions },
    tool_use_id: 'test-tool-use-id',
  } as HookInput;
}

const abortController = new AbortController();
const hookOptions = { signal: abortController.signal };

describe('createAskUserQuestionHook', () => {
  let ipcDir: string;

  beforeEach(async () => {
    ipcDir = await mkdtemp(join(tmpdir(), 'agent-runner-test-'));
  });

  afterEach(async () => {
    await rm(ipcDir, { recursive: true, force: true });
  });

  it('should write question file to IPC dir and return answer', async () => {
    const hook = createAskUserQuestionHook(ipcDir);

    const questions = [{ question: 'Pick a color?' }];
    const hookPromise = hook(
      makeHookInput(questions),
      'test-tool-use-id',
      hookOptions,
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

    const result = await hookPromise;
    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: expect.stringContaining('Pick a color?'),
      },
    });
    expect(
      (result as { hookSpecificOutput: { permissionDecisionReason: string } })
        .hookSpecificOutput.permissionDecisionReason,
    ).toContain('A: blue');
  });

  it('should handle empty questions array', async () => {
    const hook = createAskUserQuestionHook(ipcDir);

    const hookPromise = hook(
      makeHookInput([]),
      'test-tool-use-id',
      hookOptions,
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

    const result = await hookPromise;
    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'The user was asked and provided the following answers:',
      },
    });
  });
});
