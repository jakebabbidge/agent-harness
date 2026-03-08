import type { OutboundMessage, QuestionMessage } from '../messages.js';
import type { RunResult } from '../execution/container-lifecycle.js';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed';

export interface ExecutionState {
  id: string;
  label: string;
  status: ExecutionStatus;
  messages: OutboundMessage[];
  pendingQuestion: QuestionMessage | null;
  result: RunResult | null;
  error: string | null;
}
