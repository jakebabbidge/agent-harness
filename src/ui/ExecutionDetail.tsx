import React, { useRef } from 'react';
import { Box, Static, Text } from 'ink';
import { StatusIcon } from './StatusIcon.js';
import { QuestionPrompt } from './QuestionPrompt.js';
import type { ExecutionState } from '../run-session/index.js';
import type { OutboundMessage } from '../messages.js';

interface ExecutionDetailProps {
  execution: ExecutionState;
  onAnswer: (answers: Record<string, string>) => void;
  showBackHint: boolean;
}

interface StaticItem {
  id: string;
  message: OutboundMessage;
  answeredQuestions: Map<string, Record<string, string>>;
}

function MessageLine({
  message,
  answeredQuestions,
}: {
  message: OutboundMessage;
  answeredQuestions: Map<string, Record<string, string>>;
}) {
  switch (message.type) {
    case 'thinking':
      return <Text dimColor>{message.content}</Text>;
    case 'text':
      return <Text>{message.content}</Text>;
    case 'tool_use':
      return <Text dimColor>[tool: {message.name}]</Text>;
    case 'error':
      return <Text color="red">Error: {message.error}</Text>;
    case 'question': {
      const answers = answeredQuestions.get(message.id);
      if (!answers) return null;
      return (
        <Box flexDirection="column">
          {message.questions.map((q) => (
            <Box key={q.question} flexDirection="column">
              <Text color="yellow">? {q.question}</Text>
              <Text color="cyan">
                {'  '}
                {answers[q.question] ?? '(no answer)'}
              </Text>
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
  // Track how many messages have been flushed to Static.
  // Once flushed, they never re-render.
  const flushedCountRef = useRef(0);

  const messages = execution.messages;
  const total = messages.length;

  // All messages except the last one are finalized and can be static.
  // Keep at least one message dynamic so the latest output is always visible.
  const staticEnd = Math.max(flushedCountRef.current, total - 1);
  flushedCountRef.current = staticEnd;

  const staticItems: StaticItem[] = [];
  for (let i = 0; i < staticEnd; i++) {
    staticItems.push({
      id: String(i),
      message: messages[i],
      answeredQuestions: execution.answeredQuestions,
    });
  }

  const dynamicMessages = messages.slice(staticEnd);

  return (
    <Box flexDirection="column">
      <Static items={staticItems}>
        {(item, index) => {
          if (index === 0) {
            return (
              <Box key={item.id} flexDirection="column">
                <Box gap={1}>
                  <StatusIcon status={execution.status} />
                  <Text bold>{execution.label}</Text>
                </Box>
                <MessageLine
                  message={item.message}
                  answeredQuestions={item.answeredQuestions}
                />
              </Box>
            );
          }
          return (
            <Box key={item.id}>
              <MessageLine
                message={item.message}
                answeredQuestions={item.answeredQuestions}
              />
            </Box>
          );
        }}
      </Static>

      {staticEnd === 0 && (
        <Box gap={1}>
          <StatusIcon status={execution.status} />
          <Text bold>{execution.label}</Text>
        </Box>
      )}

      <Box flexDirection="column">
        {dynamicMessages.map((msg, i) => (
          <MessageLine
            key={staticEnd + i}
            message={msg}
            answeredQuestions={execution.answeredQuestions}
          />
        ))}
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
