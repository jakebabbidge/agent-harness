import { EventEmitter } from 'node:events';
import { executeRun } from '../execution/container-lifecycle.js';
import type {
  OutboundMessage,
  QuestionMessage,
  AnswerMessage,
} from '../messages.js';
import type { RunResult } from '../execution/container-lifecycle.js';
import type { ExecutionState } from './types.js';

export class RunSession extends EventEmitter {
  private executions = new Map<string, ExecutionState>();
  private questionResolvers = new Map<
    string,
    (answer: AnswerMessage) => void
  >();

  getExecutions(): ExecutionState[] {
    return [...this.executions.values()];
  }

  getExecution(id: string): ExecutionState | undefined {
    return this.executions.get(id);
  }

  registerExecution(id: string, label: string): void {
    const state: ExecutionState = {
      id,
      label,
      status: 'pending',
      messages: [],
      pendingQuestion: null,
      result: null,
      error: null,
    };

    this.executions.set(id, state);
    this.emit('executionAdded', state);
  }

  async startExecution(id: string, prompt: string): Promise<RunResult> {
    const state = this.executions.get(id);
    if (!state) {
      throw new Error(`Unknown execution "${id}"`);
    }

    state.status = 'running';
    this.emit('executionUpdated', state);

    try {
      const result = await executeRun(
        prompt,
        (question) => this.handleQuestion(id, question),
        (message) => this.handleMessage(id, message),
      );

      state.status = 'completed';
      state.result = result;
      this.emit('executionUpdated', state);
      this.emitSessionCompletedIfDone();

      return result;
    } catch (err) {
      state.status = 'failed';
      state.error = (err as Error).message;
      this.emit('executionUpdated', state);
      this.emitSessionCompletedIfDone();
      throw err;
    }
  }

  answerQuestion(executionId: string, answers: Record<string, string>): void {
    const state = this.executions.get(executionId);
    if (!state || !state.pendingQuestion) {
      throw new Error(`No pending question for execution "${executionId}"`);
    }

    const answer: AnswerMessage = {
      type: 'answer',
      id: state.pendingQuestion.id,
      answers,
    };

    const resolver = this.questionResolvers.get(executionId);
    if (!resolver) {
      throw new Error(`No question resolver for execution "${executionId}"`);
    }

    state.pendingQuestion = null;
    state.status = 'running';
    this.emit('executionUpdated', state);

    this.questionResolvers.delete(executionId);
    resolver(answer);
  }

  private handleQuestion(
    executionId: string,
    question: QuestionMessage,
  ): Promise<AnswerMessage> {
    const state = this.executions.get(executionId);
    if (!state) {
      throw new Error(`Unknown execution "${executionId}"`);
    }

    state.pendingQuestion = question;
    state.status = 'blocked';
    this.emit('executionUpdated', state);

    return new Promise<AnswerMessage>((resolve) => {
      this.questionResolvers.set(executionId, resolve);
    });
  }

  private handleMessage(executionId: string, message: OutboundMessage): void {
    const state = this.executions.get(executionId);
    if (!state) return;

    state.messages.push(message);
    this.emit('executionUpdated', state);
  }

  private emitSessionCompletedIfDone(): void {
    const all = this.getExecutions();
    const allDone = all.every(
      (e) => e.status === 'completed' || e.status === 'failed',
    );
    if (allDone) {
      this.emit('sessionCompleted');
    }
  }
}
