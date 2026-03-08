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

// --- Free text input (shared by all modes) ---

function TextEntry({
  prompt,
  onSubmit,
}: {
  prompt: string;
  onSubmit: (value: string) => void;
}) {
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
    <Box>
      <Text color="cyan">{prompt} </Text>
      <Text>{value}</Text>
      <Text dimColor>█</Text>
    </Box>
  );
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
  const [mode, setMode] = useState<'select' | 'custom'>('select');

  useInput(
    (input, key) => {
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedIndex((i) => Math.min(totalItems - 1, i + 1));
      } else if (key.return) {
        if (selectedIndex === otherIndex) {
          setMode('custom');
        } else {
          onSubmit(options[selectedIndex].label);
        }
      }
      const num = parseInt(input, 10);
      if (num >= 1 && num <= options.length) {
        onSubmit(options[num - 1].label);
      } else if (num === totalItems) {
        setMode('custom');
      }
    },
    { isActive: mode === 'select' },
  );

  if (mode === 'custom') {
    return (
      <Box flexDirection="column">
        {item.header && <Text color="cyan">[{item.header}]</Text>}
        <Text bold>{item.question}</Text>
        <TextEntry prompt="Enter your answer:" onSubmit={onSubmit} />
      </Box>
    );
  }

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
        <Text color={selectedIndex === otherIndex ? 'cyan' : undefined}>
          {selectedIndex === otherIndex ? '❯' : ' '} {totalItems}.{' '}
        </Text>
        <Text dimColor>Other (type your own)</Text>
      </Box>
      <Text dimColor>Use arrow keys and Enter to select</Text>
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
  const [customAnswers, setCustomAnswers] = useState<string[]>([]);
  const [mode, setMode] = useState<'select' | 'custom'>('select');

  useInput(
    (_input, key) => {
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedIndex((i) => Math.min(totalItems - 1, i + 1));
      } else if (key.return) {
        if (toggled.size === 0 && customAnswers.length === 0) return;
        const labels = [...toggled].sort().map((i) => options[i].label);
        const all = [...labels, ...customAnswers];
        onSubmit(all.join(', '));
      }
      if (_input === ' ') {
        if (selectedIndex === customIndex) {
          setMode('custom');
        } else {
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
      }
    },
    { isActive: mode === 'select' },
  );

  if (mode === 'custom') {
    return (
      <Box flexDirection="column">
        {item.header && <Text color="cyan">[{item.header}]</Text>}
        <Text bold>{item.question}</Text>
        <TextEntry
          prompt="Enter custom option:"
          onSubmit={(value) => {
            setCustomAnswers((prev) => [...prev, value.trim()]);
            setMode('select');
          }}
        />
      </Box>
    );
  }

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
        <Text color={selectedIndex === customIndex ? 'cyan' : undefined}>
          {selectedIndex === customIndex ? '❯' : ' '}{' '}
        </Text>
        <Text dimColor>Add custom option</Text>
      </Box>
      {customAnswers.map((c) => (
        <Box key={c} marginLeft={4}>
          <Text color="green">[x]</Text>
          <Text> {c}</Text>
        </Box>
      ))}
      <Text dimColor>
        Space to toggle, Enter to confirm (select at least one)
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
  return (
    <Box flexDirection="column">
      {item.header && <Text color="cyan">[{item.header}]</Text>}
      <Text bold>{item.question}</Text>
      <TextEntry prompt="&gt;" onSubmit={onSubmit} />
    </Box>
  );
}
