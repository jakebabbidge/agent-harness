import type { QuestionRecord } from '../types/index.js';
export declare class QuestionStore {
    private readonly baseDir;
    constructor(baseDir?: string);
    runDir(runId: string): string;
    askAndWait(runId: string, input: {
        questions: unknown[];
    }): Promise<Record<string, string>>;
    submitAnswer(runId: string, answers: Record<string, string>): Promise<void>;
    getQuestion(runId: string): Promise<QuestionRecord | null>;
    purgeRunDir(runId: string): Promise<void>;
}
//# sourceMappingURL=question-store.d.ts.map