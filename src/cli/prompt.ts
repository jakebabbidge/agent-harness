import { createInterface } from 'node:readline';
import type {
  QuestionMessage,
  AnswerMessage,
  QuestionItem,
} from '../messages.js';

const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

export async function promptUserForAnswer(
  question: QuestionMessage,
): Promise<AnswerMessage> {
  const answers: Record<string, string> = {};

  for (const q of question.questions) {
    if (q.header) {
      console.log(`\n${CYAN}[${q.header}]${RESET}`);
    }
    console.log(`${BOLD}${q.question}${RESET}`);

    if (q.options && q.options.length > 0) {
      if (q.multiSelect) {
        answers[q.question] = await promptMultiSelect(q);
      } else {
        answers[q.question] = await promptSingleSelect(q);
      }
    } else {
      answers[q.question] = await readLine('> ');
    }
  }

  // Add new line after user selection
  console.log('');

  return { type: 'answer', id: question.id, answers };
}

async function promptSingleSelect(q: QuestionItem): Promise<string> {
  const options = q.options!;
  const customIndex = options.length + 1;

  for (let i = 0; i < options.length; i++) {
    const desc = options[i].description
      ? ` ${DIM}- ${options[i].description}${RESET}`
      : '';
    console.log(`  ${i + 1}. ${options[i].label}${desc}`);
  }
  console.log(`  ${customIndex}. ${DIM}Other (type your own)${RESET}`);

  for (;;) {
    const input = await readLine(`Select option (1-${customIndex}): `);
    const index = parseInt(input, 10);

    if (index === customIndex) {
      return await readLine('Enter your answer: ');
    }
    if (index >= 1 && index <= options.length) {
      return options[index - 1].label;
    }
    console.log(
      `${DIM}Please enter a number between 1 and ${customIndex}${RESET}`,
    );
  }
}

async function promptMultiSelect(q: QuestionItem): Promise<string> {
  const options = q.options!;
  const selected = new Set<number>();
  const customAnswers: string[] = [];
  const customIndex = options.length + 1;

  function printOptions() {
    for (let i = 0; i < options.length; i++) {
      const check = selected.has(i) ? `${GREEN}[x]${RESET}` : '[ ]';
      const desc = options[i].description
        ? ` ${DIM}- ${options[i].description}${RESET}`
        : '';
      console.log(`  ${i + 1}. ${check} ${options[i].label}${desc}`);
    }
    console.log(`  ${customIndex}. ${DIM}Add custom option${RESET}`);
    if (customAnswers.length > 0) {
      for (const c of customAnswers) {
        console.log(`       ${GREEN}[x]${RESET} ${c}`);
      }
    }
  }

  printOptions();
  console.log(
    `${DIM}Toggle options by number, or press Enter when done${RESET}`,
  );

  for (;;) {
    const input = await readLine(
      'Toggle (1-' + customIndex + ') or Enter to confirm: ',
    );

    if (input.trim() === '') {
      if (selected.size === 0 && customAnswers.length === 0) {
        console.log(`${DIM}Please select at least one option${RESET}`);
        continue;
      }
      break;
    }

    const index = parseInt(input, 10);

    if (index === customIndex) {
      const custom = await readLine('Enter custom option: ');
      if (custom.trim()) {
        customAnswers.push(custom.trim());
        console.log(`  ${GREEN}[x]${RESET} ${custom.trim()}`);
      }
      continue;
    }

    if (index >= 1 && index <= options.length) {
      const i = index - 1;
      if (selected.has(i)) {
        selected.delete(i);
      } else {
        selected.add(i);
      }
      printOptions();
      continue;
    }

    console.log(
      `${DIM}Please enter a number between 1 and ${customIndex}${RESET}`,
    );
  }

  const results: string[] = [];
  for (const i of [...selected].sort()) {
    results.push(options[i].label);
  }
  results.push(...customAnswers);
  return results.join(', ');
}

function readLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      // createInterface resumes stdin; rl.close() doesn't pause it.
      process.stdin.pause();
      process.stdin.unref();
      resolve(answer);
    });
  });
}
