import { createInterface } from 'node:readline';
import type { Question, QuestionAnswer } from '../execution/ipc.js';

export async function promptUserForAnswer(
  question: Question,
): Promise<QuestionAnswer> {
  const answers: Record<string, string> = {};

  for (const q of question.questions) {
    if (q.header) {
      console.log(`\n[${q.header}]`);
    }
    console.log(q.question);

    let answer: string;

    if (q.options && q.options.length > 0) {
      for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i];
        const desc = opt.description ? ` - ${opt.description}` : '';
        console.log(`  ${i + 1}. ${opt.label}${desc}`);
      }

      const input = await readLine(`Select option (1-${q.options.length}): `);
      const index = parseInt(input, 10) - 1;

      if (index >= 0 && index < q.options.length) {
        answer = q.options[index].label;
      } else {
        // Treat as free-text if the input isn't a valid number
        answer = input;
      }
    } else {
      answer = await readLine('> ');
    }

    answers[q.question] = answer;
  }

  return { id: question.id, answers };
}

function readLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdin.unref();
      resolve(answer);
    });
  });
}
