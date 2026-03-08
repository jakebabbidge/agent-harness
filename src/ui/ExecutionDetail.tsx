import React from 'react';
import { Box, Text } from 'ink';
import { StatusIcon } from './StatusIcon.js';
import { QuestionPrompt } from './QuestionPrompt.js';
import type { ExecutionState } from '../run-session/index.js';
import type { OutboundMessage } from '../messages.js';

interface ExecutionDetailProps {
  execution: ExecutionState;
  onAnswer: (answers: Record<string, string>) => void;
  showBackHint: boolean;
}

function formatMessage(
  message: OutboundMessage,
  index: number,
  answeredQuestions: Map<string, Record<string, string>>,
) {
  switch (message.type) {
    case 'thinking':
      return (
        <Text key={index} dimColor>
          {message.content}
        </Text>
      );
    case 'text':
      return <Text key={index}>{message.content}</Text>;
    case 'tool_use':
      return (
        <Text key={index} dimColor>
          [tool: {message.name}]
        </Text>
      );
    case 'error':
      return (
        <Text key={index} color="red">
          Error: {message.error}
        </Text>
      );
    case 'result':
      return (
        <Text key={index} color="green">
          {message.result}
        </Text>
      );
    case 'question': {
      const answers = answeredQuestions.get(message.id);
      if (!answers) return null;
      return (
        <Box key={index} flexDirection="column">
          {message.questions.map((q) => (
            <Box key={q.question} flexDirection="column">
              <Text color="yellow">? {q.question}</Text>
              <Text color="cyan"> {answers[q.question] ?? '(no answer)'}</Text>
            </Box>
          ))}
        </Box>
      );
    }
    default:
      return null;
  }
}

export function ExecutionDetail({
  execution,
  onAnswer,
  showBackHint,
}: ExecutionDetailProps) {
  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <StatusIcon status={execution.status} />
        <Text bold>{execution.label}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {execution.messages.map((msg, i) =>
          formatMessage(msg, i, execution.answeredQuestions),
        )}
      </Box>
      {execution.pendingQuestion && (
        <Box marginTop={1}>
          <QuestionPrompt
            question={execution.pendingQuestion}
            onAnswer={onAnswer}
          />
        </Box>
      )}
      {showBackHint && (
        <Box marginTop={1}>
          <Text dimColor>Esc/q to go back</Text>
        </Box>
      )}
    </Box>
  );
}
