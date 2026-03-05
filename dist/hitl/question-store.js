import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
export class QuestionStore {
    baseDir;
    constructor(baseDir) {
        this.baseDir = baseDir ?? path.join(os.tmpdir(), 'agent-harness', 'runs');
    }
    runDir(runId) {
        return path.join(this.baseDir, runId);
    }
    async askAndWait(runId, input) {
        const dir = this.runDir(runId);
        await fs.mkdir(dir, { recursive: true });
        const questionRecord = {
            runId,
            questions: input.questions,
            timestamp: new Date().toISOString(),
        };
        await fs.writeFile(path.join(dir, 'question.json'), JSON.stringify(questionRecord, null, 2));
        console.log(`[agent-harness] Agent asking question for run ${runId}`);
        // Poll for answer.json
        const answerPath = path.join(dir, 'answer.json');
        while (true) {
            await new Promise((r) => setTimeout(r, 500));
            try {
                const raw = await fs.readFile(answerPath, 'utf-8');
                const record = JSON.parse(raw);
                await fs.unlink(answerPath);
                return record.answers;
            }
            catch {
                // answer.json not yet present — keep polling
            }
        }
    }
    async submitAnswer(runId, answers) {
        const dir = this.runDir(runId);
        const questionPath = path.join(dir, 'question.json');
        // Verify a question exists
        try {
            await fs.access(questionPath);
        }
        catch {
            throw new Error(`No question.json found for run ${runId} — cannot submit answer without an active question`);
        }
        const answerRecord = {
            runId,
            answers,
            answeredAt: new Date().toISOString(),
        };
        await fs.writeFile(path.join(dir, 'answer.json'), JSON.stringify(answerRecord, null, 2));
    }
    async getQuestion(runId) {
        const questionPath = path.join(this.runDir(runId), 'question.json');
        try {
            const raw = await fs.readFile(questionPath, 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    async purgeRunDir(runId) {
        await fs.rm(this.runDir(runId), { recursive: true, force: true });
    }
}
//# sourceMappingURL=question-store.js.map