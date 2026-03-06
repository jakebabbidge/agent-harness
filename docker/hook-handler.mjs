#!/usr/bin/env node

import { readFileSync, writeFileSync, appendFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const IPC_DIR = '/tmp/output';
const LOG_FILE = join(IPC_DIR, 'hook-handler.log');
const POLL_INTERVAL_MS = 500;
const TIMEOUT_MS = 5 * 60 * 1000;

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  try {
    appendFileSync(LOG_FILE, line, 'utf-8');
  } catch {
    // ignore
  }
}

function formatAnswerReason(questions, answers) {
  const lines = ['The user was asked and provided the following answers:'];
  for (const q of questions) {
    const answer = answers[q.question];
    if (answer !== undefined) {
      lines.push(`Q: ${q.question}`);
      lines.push(`A: ${answer}`);
    }
  }
  return lines.join('\n');
}

function answerResponse(questions, answers) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: 'auto-allow',
      updatedInput: {
        questions: questions,
        answers,
      },
    },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeAtomic(filePath, data) {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, filePath);
}

async function handleAskUserQuestion(toolInput) {
  const id = randomUUID();
  const questions = toolInput.questions || [];

  log(`handleAskUserQuestion called, id=${id}, questions=${JSON.stringify(questions)}`);

  const questionFile = join(IPC_DIR, `question-${id}.json`);
  writeAtomic(questionFile, JSON.stringify({ id, questions }));
  log(`Wrote question file: ${questionFile}`);

  const answerFile = join(IPC_DIR, `answer-${id}.json`);
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    if (existsSync(answerFile)) {
      const raw = readFileSync(answerFile, 'utf-8');
      log(`Found answer file: ${answerFile}, content: ${raw}`);
      const answer = JSON.parse(raw);
      const response = answerResponse(questions, answer.answers);
      log(`Returning response: ${response}`);
      return response;
    }
  }

  log(`Timeout waiting for answer, id=${id}`);
  // Timeout: let Claude Code handle it normally
  return '';
}

async function main() {
  try {
    const input = readFileSync(0, 'utf-8');
    log(`Received input: ${input.substring(0, 500)}`);
    const payload = JSON.parse(input);
    log(`Parsed payload, tool_name=${payload.tool_name}`);

    if (payload.tool_name === 'AskUserQuestion') {
      const response = await handleAskUserQuestion(payload.tool_input);
      if (response) {
        log(`Writing response to stdout (${response.length} bytes)`);
        process.stdout.write(response);
      } else {
        log('No response (empty/timeout), allowing tool call to proceed');
      }
    } else {
      log(`Ignoring tool: ${payload.tool_name}`);
    }
  } catch (err) {
    log(`Error in main: ${err.message}\n${err.stack}`);
    // Exit 0 with no output = allow tool call to proceed
  }
}

log('Hook handler started');

main();
