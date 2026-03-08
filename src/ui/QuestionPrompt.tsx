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

// --- Single select ---

interface SingleSelectInputProps {
  item: QuestionItem;
  onSubmit: (answer: string) => void;
}

function SingleSelectInput({ item, onSubmit }: SingleSelectInputProps) {
  const options = item.options!;
  const otherIndex = options.length;
  const totalItems = options.length + 1;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [customText, setCustomText] = useState('');

  const onOtherRow = selectedIndex === otherIndex;

  useInput((input, key) => {
    if (onOtherRow) {
      if (key.return) {
        if (customText.trim()) {
          onSubmit(customText);
        }
        return;
      }
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.backspace || key.delete) {
        setCustomText((v) => v.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && !key.downArrow && input) {
        setCustomText((v) => v + input);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(totalItems - 1, i + 1));
    } else if (key.return) {
      onSubmit(options[selectedIndex].label);
    }
    const num = parseInt(input, 10);
    if (num >= 1 && num <= options.length) {
      onSubmit(options[num - 1].label);
    } else if (num === totalItems) {
      setSelectedIndex(otherIndex);
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
      <Box>
        <Text color={onOtherRow ? 'cyan' : undefined}>
          {onOtherRow ? '❯' : ' '} {totalItems}.{' '}
        </Text>
        {onOtherRow && customText ? (
          <>
            <Text>{customText}</Text>
            <Text dimColor>█</Text>
          </>
        ) : (
          <Text dimColor>Type your answer…</Text>
        )}
      </Box>
      <Text dimColor>
        {onOtherRow
          ? 'Type your answer, Enter to submit'
          : 'Use arrow keys and Enter to select'}
      </Text>
    </Box>
  );
}

// --- Multi select ---

interface MultiSelectInputProps {
  item: QuestionItem;
  onSubmit: (answer: string) => void;
}

function MultiSelectInput({ item, onSubmit }: MultiSelectInputProps) {
  const options = item.options!;
  const customIndex = options.length;
  const totalItems = options.length + 1;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [toggled, setToggled] = useState<Set<number>>(new Set());
  const [customText, setCustomText] = useState('');

  const onCustomRow = selectedIndex === customIndex;
  const hasCustom = customText.trim().length > 0;

  useInput((_input, key) => {
    if (onCustomRow) {
      if (key.return) {
        const labels = [...toggled].sort().map((i) => options[i].label);
        if (hasCustom) labels.push(customText.trim());
        if (labels.length === 0) return;
        onSubmit(labels.join(', '));
        return;
      }
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.backspace || key.delete) {
        setCustomText((v) => v.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && !key.downArrow && _input) {
        setCustomText((v) => v + _input);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(totalItems - 1, i + 1));
    } else if (key.return) {
      const labels = [...toggled].sort().map((i) => options[i].label);
      if (hasCustom) labels.push(customText.trim());
      if (labels.length === 0) return;
      onSubmit(labels.join(', '));
    }
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
      <Box>
        <Text color={onCustomRow ? 'cyan' : undefined}>
          {onCustomRow ? '❯' : ' '}{' '}
          {hasCustom ? <Text color="green">[x]</Text> : <Text>[ ]</Text>}{' '}
        </Text>
        {customText ? (
          <>
            <Text>{customText}</Text>
            {onCustomRow && <Text dimColor>█</Text>}
          </>
        ) : (
          <Text dimColor>Type custom option…</Text>
        )}
      </Box>
      <Text dimColor>
        {onCustomRow
          ? 'Type to add, delete to remove, Enter to confirm'
          : 'Space to toggle, Enter to confirm (select at least one)'}
      </Text>
    </Box>
  );
}

// --- Standalone free text ---

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
