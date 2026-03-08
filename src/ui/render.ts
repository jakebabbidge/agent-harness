import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import type { RunSession } from '../run-session/index.js';

export interface AppInstance {
  unmount: () => void;
  waitUntilExit: () => Promise<void>;
}

const ALT_SCREEN_ON = '\x1B[?1049h';
const ALT_SCREEN_OFF = '\x1B[?1049l';
const CLEAR_SCREEN = '\x1B[2J\x1B[H';

export function renderApp(session: RunSession): AppInstance {
  // Switch to alternate screen buffer to preserve terminal history
  process.stdout.write(ALT_SCREEN_ON + CLEAR_SCREEN);

  const instance = render(React.createElement(App, { session }));
  return {
    unmount: () => {
      instance.unmount();
      process.stdout.write(ALT_SCREEN_OFF);
    },
    waitUntilExit: async () => {
      await instance.waitUntilExit();
      process.stdout.write(ALT_SCREEN_OFF);
    },
  };
}
