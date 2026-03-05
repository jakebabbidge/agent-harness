import { QuestionStore } from '../hitl/question-store.js';

export async function answerCommand(
  runId: string,
  answerText: string,
  options?: { path?: string },
): Promise<void> {
  const questionStore = options?.path
    ? QuestionStore.forWorktree(options.path)
    : new QuestionStore();

  // In flat (worktree) mode, runId is ignored by runDir — pass it through for logging
  const question = await questionStore.getQuestion(runId);

  if (!question) {
    const msg = `[agent-harness] No pending question for run ${runId}.`;
    if (options?.path) {
      throw new Error(msg);
    }
    console.error(msg);
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
    if (options?.path) {
      throw new Error(message);
    }
    console.error(`[agent-harness] Error: ${message}`);
    process.exit(1);
  }
}
