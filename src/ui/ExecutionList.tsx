import React from 'react';
import { Box, Text, useInput } from 'ink';
import { StatusIcon } from './StatusIcon.js';
import type { ExecutionState } from '../run-session/index.js';

interface ExecutionListProps {
  executions: ExecutionState[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onSelect: (id: string) => void;
}

export function ExecutionList({
  executions,
  selectedIndex,
  onSelectedIndexChange,
  onSelect,
}: ExecutionListProps) {
  useInput((_input, key) => {
    if (key.upArrow) {
      onSelectedIndexChange(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      onSelectedIndexChange(Math.min(executions.length - 1, selectedIndex + 1));
    } else if (key.return) {
      if (executions[selectedIndex]) {
        onSelect(executions[selectedIndex].id);
      }
    }
  });

  if (executions.length === 0) {
    return <Text dimColor>No executions.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold>Executions</Text>
      {executions.map((exec, i) => (
        <Box key={exec.id} gap={1}>
          <Text color={i === selectedIndex ? 'cyan' : undefined}>
            {i === selectedIndex ? '❯' : ' '}
          </Text>
          <StatusIcon status={exec.status} />
          <Text color={i === selectedIndex ? 'cyan' : undefined}>
            {exec.label}
          </Text>
        </Box>
      ))}
      <Text dimColor>↑↓ navigate, Enter to view details</Text>
    </Box>
  );
}
