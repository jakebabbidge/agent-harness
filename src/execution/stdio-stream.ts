import { createInterface } from 'node:readline';
import type { Writable, Readable } from 'node:stream';
import {
  serialize,
  parseOutboundLine,
  type InboundMessage,
  type OutboundMessage,
} from '../messages.js';

export function sendMessage(stdin: Writable, msg: InboundMessage): void {
  stdin.write(serialize(msg));
}

export async function* readMessages(
  stdout: Readable,
): AsyncGenerator<OutboundMessage> {
  const rl = createInterface({ input: stdout, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const message = parseOutboundLine(trimmed);
      if (message) {
        yield message;
      }
    }
  } finally {
    rl.close();
  }
}
