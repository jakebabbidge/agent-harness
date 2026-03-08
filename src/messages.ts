export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionItem {
  question: string;
  options?: QuestionOption[];
  header?: string;
  multiSelect?: boolean;
}

// Outbound messages (container → host, via stdout)

export interface ThinkingMessage {
  type: 'thinking';
  content: string;
}

export interface TextMessage {
  type: 'text';
  content: string;
}

export interface ToolUseMessage {
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
}

export interface QuestionMessage {
  type: 'question';
  id: string;
  questions: QuestionItem[];
}

export interface ResultMessage {
  type: 'result';
  result: string;
}

export interface ErrorMessage {
  type: 'error';
  error: string;
}

export type OutboundMessage =
  | ThinkingMessage
  | TextMessage
  | ToolUseMessage
  | QuestionMessage
  | ResultMessage
  | ErrorMessage;

// Inbound messages (host → container, via stdin)

export interface PromptMessage {
  type: 'prompt';
  prompt: string;
}

export interface AnswerMessage {
  type: 'answer';
  id: string;
  answers: Record<string, string>;
}

export type InboundMessage = PromptMessage | AnswerMessage;

// Handler types

export type QuestionHandler = (
  question: QuestionMessage,
) => Promise<AnswerMessage>;

export type MessageHandler = (message: OutboundMessage) => void;

// Serialization utilities

export function serialize(message: OutboundMessage | InboundMessage): string {
  return JSON.stringify(message) + '\n';
}

export function parseOutboundLine(line: string): OutboundMessage | null {
  try {
    const parsed = JSON.parse(line);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.type === 'string' &&
      ['thinking', 'text', 'tool_use', 'question', 'result', 'error'].includes(
        parsed.type,
      )
    ) {
      return parsed as OutboundMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseInboundLine(line: string): InboundMessage | null {
  try {
    const parsed = JSON.parse(line);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.type === 'string' &&
      ['prompt', 'answer'].includes(parsed.type)
    ) {
      return parsed as InboundMessage;
    }
    return null;
  } catch {
    return null;
  }
}
