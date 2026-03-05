import { QuestionStore } from '../hitl/question-store.js';

export async function answerCommand(runId: string, answerText: string): Promise<void> {
  const questionStore = new QuestionStore();

  const question = await questionStore.getQuestion(runId);

  if (!question) {
    console.error(`[agent-harness] No pending question for run ${runId}.`);
    process.exit(1);
  }

  const answers: Record<string, string> = {};
  for (const q of question.questions) {
    answers[q.question] = answerText;
  }

  try {
    await questionStore.submitAnswer(runId, answers);
    console.log(`[agent-harness] Answer submitted for run ${runId}. Agent will resume shortly.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent-harness] Error: ${message}`);
    process.exit(1);
  }
}
