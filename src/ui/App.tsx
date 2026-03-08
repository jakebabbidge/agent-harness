import React, { useState, useCallback } from 'react';
import { useInput, useApp } from 'ink';
import { ExecutionList } from './ExecutionList.js';
import { ExecutionDetail } from './ExecutionDetail.js';
import { useRunSession } from './useRunSession.js';
import type { RunSession } from '../run-session/index.js';

const CLEAR = '\x1B[2J\x1B[H';

interface AppProps {
  session: RunSession;
}

export function App({ session }: AppProps) {
  const { executions } = useRunSession(session);
  const { exit } = useApp();
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(
    null,
  );
  const [listIndex, setListIndex] = useState(0);

  const allDone = executions.every(
    (e) => e.status === 'completed' || e.status === 'failed',
  );

  const selectedExecution = selectedExecutionId
    ? executions.find((e) => e.id === selectedExecutionId)
    : undefined;

  useInput((_input, key) => {
    if (view === 'detail') {
      if (key.escape || _input === 'q') {
        process.stdout.write(CLEAR);
        setView('list');
        setSelectedExecutionId(null);
      }
    } else if (view === 'list') {
      if (_input === 'q' && allDone) {
        exit();
      }
    }
  });

  const handleSelect = useCallback((id: string) => {
    process.stdout.write(CLEAR);
    setSelectedExecutionId(id);
    setView('detail');
  }, []);

  const handleAnswer = useCallback(
    (answers: Record<string, string>) => {
      if (selectedExecutionId) {
        session.answerQuestion(selectedExecutionId, answers);
      }
    },
    [session, selectedExecutionId],
  );

  if (view === 'detail' && selectedExecution) {
    return (
      <ExecutionDetail
        execution={selectedExecution}
        onAnswer={handleAnswer}
        showBackHint={true}
      />
    );
  }

  return (
    <ExecutionList
      executions={executions}
      selectedIndex={listIndex}
      onSelectedIndexChange={setListIndex}
      onSelect={handleSelect}
      allDone={allDone}
    />
  );
}
