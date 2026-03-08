import { useState, useEffect } from 'react';
import type { RunSession } from '../run-session/index.js';
import type { ExecutionState } from '../run-session/index.js';

export function useRunSession(session: RunSession): {
  executions: ExecutionState[];
} {
  const [executions, setExecutions] = useState<ExecutionState[]>(
    session.getExecutions(),
  );

  useEffect(() => {
    const update = () => {
      setExecutions([...session.getExecutions()]);
    };

    session.on('executionAdded', update);
    session.on('executionUpdated', update);
    session.on('sessionCompleted', update);

    return () => {
      session.off('executionAdded', update);
      session.off('executionUpdated', update);
      session.off('sessionCompleted', update);
    };
  }, [session]);

  return { executions };
}
