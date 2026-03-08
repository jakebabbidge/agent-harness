import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { QuestionMessage, QuestionItem } from '../messages.js';

interface QuestionPromptProps {
  question: QuestionMessage;
  onAnswer: (answers: Record<string, string>) => void;
}

export function QuestionPrompt({ question, onAnswer }: QuestionPromptProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const currentItem = question.questions[questionIndex];
  if (!currentItem) return null;

  const handleItemAnswer = (answer: string) => {
    const newAnswers = { ...answers, [currentItem.question]: answer };
    if (questionIndex + 1 < question.questions.length) {
      setAnswers(newAnswers);
      setQuestionIndex(questionIndex + 1);
    } else {
      onAnswer(newAnswers);
    }
  };

  if (currentItem.options && currentItem.options.length > 0) {
    if (currentItem.multiSelect) {
      return (
        <MultiSelectInput item={currentItem} onSubmit={handleItemAnswer} />
      );
    }
    return <SingleSelectInput item={currentItem} onSubmit={handleItemAnswer} />;
  }

  return <FreeTextInput item={currentItem} onSubmit={handleItemAnswer} />;
}

interface SingleSelectInputProps {
  item: QuestionItem;
  onSubmit: (answer: string) => void;
}

function SingleSelectInput({ item, onSubmit }: SingleSelectInputProps) {
  const options = item.options!;
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (key.return) {
      onSubmit(options[selectedIndex].label);
    }
    // Number key shortcut
    const num = parseInt(input, 10);
    if (num >= 1 && num <= options.length) {
      onSubmit(options[num - 1].label);
    }
  });

  return (
    <Box flexDirection="column">
      {item.header && <Text color="cyan">[{item.header}]</Text>}
      <Text bold>{item.question}</Text>
      {options.map((opt, i) => (
        <Box key={opt.label}>
          <Text color={i === selectedIndex ? 'cyan' : undefined}>
            {i === selectedIndex ? '❯' : ' '} {i + 1}. {opt.label}
          </Text>
          {opt.description && <Text dimColor> - {opt.description}</Text>}
        </Box>
      ))}
      <Text dimColor>Use arrow keys and Enter to select</Text>
    </Box>
  );
}

interface MultiSelectInputProps {
  item: QuestionItem;
  onSubmit: (answer: string) => void;
}

function MultiSelectInput({ item, onSubmit }: MultiSelectInputProps) {
  const options = item.options!;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [toggled, setToggled] = useState<Set<number>>(new Set());

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (key.return) {
      if (toggled.size === 0) return;
      const labels = [...toggled]
        .sort()
        .map((i) => options[i].label)
        .join(', ');
      onSubmit(labels);
    }
    // Space to toggle
    if (_input === ' ') {
      setToggled((prev) => {
        const next = new Set(prev);
        if (next.has(selectedIndex)) {
          next.delete(selectedIndex);
        } else {
          next.add(selectedIndex);
        }
        return next;
      });
    }
  });

  return (
    <Box flexDirection="column">
      {item.header && <Text color="cyan">[{item.header}]</Text>}
      <Text bold>{item.question}</Text>
      {options.map((opt, i) => (
        <Box key={opt.label}>
          <Text color={i === selectedIndex ? 'cyan' : undefined}>
            {i === selectedIndex ? '❯' : ' '}{' '}
            {toggled.has(i) ? <Text color="green">[x]</Text> : <Text>[ ]</Text>}{' '}
            {opt.label}
          </Text>
          {opt.description && <Text dimColor> - {opt.description}</Text>}
        </Box>
      ))}
      <Text dimColor>
        Space to toggle, Enter to confirm (select at least one)
      </Text>
    </Box>
  );
}

interface FreeTextInputProps {
  item: QuestionItem;
  onSubmit: (answer: string) => void;
}

function FreeTextInput({ item, onSubmit }: FreeTextInputProps) {
  const [value, setValue] = useState('');

  useInput((input, key) => {
    if (key.return) {
      if (value.trim()) {
        onSubmit(value);
      }
    } else if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
    } else if (!key.ctrl && !key.meta && input) {
      setValue((v) => v + input);
    }
  });

  return (
    <Box flexDirection="column">
      {item.header && <Text color="cyan">[{item.header}]</Text>}
      <Text bold>{item.question}</Text>
      <Box>
        <Text color="cyan">&gt; </Text>
        <Text>{value}</Text>
        <Text dimColor>█</Text>
      </Box>
    </Box>
  );
}
