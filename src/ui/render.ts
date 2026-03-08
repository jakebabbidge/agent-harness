import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import type { RunSession } from '../run-session/index.js';

export interface AppInstance {
  unmount: () => void;
  waitUntilExit: () => Promise<void>;
}

export function renderApp(session: RunSession): AppInstance {
  const instance = render(React.createElement(App, { session }));
  return {
    unmount: () => instance.unmount(),
    waitUntilExit: () => instance.waitUntilExit(),
  };
}
