import React from 'react';
import { Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ExecutionStatus } from '../run-session/index.js';

interface StatusIconProps {
  status: ExecutionStatus;
}

export function StatusIcon({ status }: StatusIconProps) {
  switch (status) {
    case 'pending':
      return <Text dimColor>-</Text>;
    case 'running':
      return (
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
      );
    case 'blocked':
      return <Text color="yellow">?</Text>;
    case 'completed':
      return <Text color="green">✓</Text>;
    case 'failed':
      return <Text color="red">✗</Text>;
  }
}
