import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { sendMessage, readMessages } from './stdio-stream.js';
import type { InboundMessage, OutboundMessage } from '../messages.js';

describe('sendMessage', () => {
  it('should write NDJSON line to writable stream', () => {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));

    const msg: InboundMessage = { type: 'prompt', prompt: 'hello' };
    sendMessage(stream, msg);

    const written = Buffer.concat(chunks).toString('utf-8');
    expect(written).toBe('{"type":"prompt","prompt":"hello"}\n');
  });

  it('should write answer messages', () => {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));

    const msg: InboundMessage = {
      type: 'answer',
      id: 'q1',
      answers: { Q: 'A' },
    };
    sendMessage(stream, msg);

    const written = Buffer.concat(chunks).toString('utf-8');
    expect(JSON.parse(written.trim())).toEqual(msg);
  });
});

describe('readMessages', () => {
  it('should yield parsed outbound messages', async () => {
    const stream = new PassThrough();

    const messages: OutboundMessage[] = [];
    const reading = (async () => {
      for await (const msg of readMessages(stream)) {
        messages.push(msg);
      }
    })();

    stream.write('{"type":"thinking","content":"hmm"}\n');
    stream.write('{"type":"result","result":"done"}\n');
    stream.end();

    await reading;

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: 'thinking', content: 'hmm' });
    expect(messages[1]).toEqual({ type: 'result', result: 'done' });
  });

  it('should skip non-JSON lines', async () => {
    const stream = new PassThrough();

    const messages: OutboundMessage[] = [];
    const reading = (async () => {
      for await (const msg of readMessages(stream)) {
        messages.push(msg);
      }
    })();

    stream.write('some random log output\n');
    stream.write('{"type":"result","result":"ok"}\n');
    stream.write('another log line\n');
    stream.end();

    await reading;

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'result', result: 'ok' });
  });

  it('should skip empty lines', async () => {
    const stream = new PassThrough();

    const messages: OutboundMessage[] = [];
    const reading = (async () => {
      for await (const msg of readMessages(stream)) {
        messages.push(msg);
      }
    })();

    stream.write('\n\n{"type":"result","result":"ok"}\n\n');
    stream.end();

    await reading;

    expect(messages).toHaveLength(1);
  });

  it('should skip JSON with unknown types', async () => {
    const stream = new PassThrough();

    const messages: OutboundMessage[] = [];
    const reading = (async () => {
      for await (const msg of readMessages(stream)) {
        messages.push(msg);
      }
    })();

    stream.write('{"type":"unknown","data":"foo"}\n');
    stream.write('{"type":"result","result":"ok"}\n');
    stream.end();

    await reading;

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('result');
  });
});
