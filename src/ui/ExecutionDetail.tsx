import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { StatusIcon } from './StatusIcon.js';
import { QuestionPrompt } from './QuestionPrompt.js';
import type { ExecutionState } from '../run-session/index.js';
import type { OutboundMessage } from '../messages.js';

interface ExecutionDetailProps {
  execution: ExecutionState;
  onAnswer: (answers: Record<string, string>) => void;
  showBackHint: boolean;
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
    case 'result':
      return <Text color="green">{message.result}</Text>;
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

// Reserve lines for: header (1) + blank line (1) + hint (2) + question prompt (~8 worst case)
const CHROME_LINES = 12;

export function ExecutionDetail({
  execution,
  onAnswer,
  showBackHint,
}: ExecutionDetailProps) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const viewportSize = Math.max(1, termHeight - CHROME_LINES);

  const messages = execution.messages;
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new messages arrive (if user hasn't scrolled up)
  useEffect(() => {
    if (autoScroll) {
      const maxOffset = Math.max(0, messages.length - viewportSize);
      setScrollOffset(maxOffset);
    }
  }, [messages.length, autoScroll, viewportSize]);

  useInput(
    (_input, key) => {
      if (key.upArrow || _input === 'k') {
        setAutoScroll(false);
        setScrollOffset((o) => Math.max(0, o - 1));
      } else if (key.downArrow || _input === 'j') {
        setScrollOffset((o) => {
          const maxOffset = Math.max(0, messages.length - viewportSize);
          const next = Math.min(maxOffset, o + 1);
          if (next >= maxOffset) {
            setAutoScroll(true);
          }
          return next;
        });
      }
    },
    { isActive: !execution.pendingQuestion },
  );

  const maxOffset = Math.max(0, messages.length - viewportSize);
  const visibleMessages = messages.slice(
    scrollOffset,
    scrollOffset + viewportSize,
  );

  const atBottom = scrollOffset >= maxOffset;
  const atTop = scrollOffset === 0;

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <StatusIcon status={execution.status} />
        <Text bold>{execution.label}</Text>
        {messages.length > viewportSize && (
          <Text dimColor>
            [{scrollOffset + 1}-
            {Math.min(scrollOffset + viewportSize, messages.length)}/
            {messages.length}]
          </Text>
        )}
      </Box>

      {!atTop && <Text dimColor>{'  ↑ more above'}</Text>}

      <Box flexDirection="column" marginTop={atTop ? 1 : 0}>
        {visibleMessages.map((msg, i) => (
          <MessageLine
            key={scrollOffset + i}
            message={msg}
            answeredQuestions={execution.answeredQuestions}
          />
        ))}
      </Box>

      {!atBottom && messages.length > viewportSize && (
        <Text dimColor>{'  ↓ more below'}</Text>
      )}

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
          <Text dimColor>
            {execution.pendingQuestion
              ? 'Esc/q to go back'
              : '↑↓/jk scroll, Esc/q to go back'}
          </Text>
        </Box>
      )}
    </Box>
  );
}
