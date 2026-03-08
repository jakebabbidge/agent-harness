import React, { useState, useCallback } from 'react';
import { useInput } from 'ink';
import { ExecutionList } from './ExecutionList.js';
import { ExecutionDetail } from './ExecutionDetail.js';
import { useRunSession } from './useRunSession.js';
import type { RunSession } from '../run-session/index.js';

interface AppProps {
  session: RunSession;
}

export function App({ session }: AppProps) {
  const { executions } = useRunSession(session);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(
    null,
  );
  const [listIndex, setListIndex] = useState(0);

  // Auto-select single execution into detail view
  const effectiveView =
    executions.length === 1 && view === 'list' ? 'detail' : view;
  const effectiveExecutionId =
    executions.length === 1 ? executions[0].id : selectedExecutionId;

  const selectedExecution = effectiveExecutionId
    ? executions.find((e) => e.id === effectiveExecutionId)
    : undefined;

  useInput((_input, key) => {
    if (effectiveView === 'detail' && executions.length > 1) {
      if (key.escape || _input === 'q') {
        setView('list');
        setSelectedExecutionId(null);
      }
    }
  });

  const handleSelect = useCallback((id: string) => {
    setSelectedExecutionId(id);
    setView('detail');
  }, []);

  const handleAnswer = useCallback(
    (answers: Record<string, string>) => {
      if (effectiveExecutionId) {
        session.answerQuestion(effectiveExecutionId, answers);
      }
    },
    [session, effectiveExecutionId],
  );

  if (effectiveView === 'detail' && selectedExecution) {
    return (
      <ExecutionDetail
        execution={selectedExecution}
        onAnswer={handleAnswer}
        showBackHint={executions.length > 1}
      />
    );
  }

  return (
    <ExecutionList
      executions={executions}
      selectedIndex={listIndex}
      onSelectedIndexChange={setListIndex}
      onSelect={handleSelect}
    />
  );
}
