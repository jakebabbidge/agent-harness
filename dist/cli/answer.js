import { QuestionStore } from '../hitl/question-store.js';
export async function answerCommand(runId, answerText) {
    const questionStore = new QuestionStore();
    const question = await questionStore.getQuestion(runId);
    if (!question) {
        console.error(`[agent-harness] No pending question for run ${runId}.`);
        process.exit(1);
    }
    const answers = {};
    for (const q of question.questions) {
        answers[q.question] = answerText;
    }
    try {
        await questionStore.submitAnswer(runId, answers);
        console.log(`[agent-harness] Answer submitted for run ${runId}. Agent will resume shortly.`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[agent-harness] Error: ${message}`);
        process.exit(1);
    }
}
//# sourceMappingURL=answer.js.map