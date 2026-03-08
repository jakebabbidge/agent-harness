import { describe, it, expect } from 'vitest';
import {
  serialize,
  parseOutboundLine,
  parseInboundLine,
  type OutboundMessage,
  type InboundMessage,
} from './messages.js';

describe('serialize', () => {
  it('should serialize an outbound message to NDJSON', () => {
    const msg: OutboundMessage = { type: 'result', result: 'hello' };
    expect(serialize(msg)).toBe('{"type":"result","result":"hello"}\n');
  });

  it('should serialize an inbound message to NDJSON', () => {
    const msg: InboundMessage = { type: 'prompt', prompt: 'do stuff' };
    expect(serialize(msg)).toBe('{"type":"prompt","prompt":"do stuff"}\n');
  });
});

describe('parseOutboundLine', () => {
  it('should parse a valid thinking message', () => {
    const line = '{"type":"thinking","content":"hmm"}';
    expect(parseOutboundLine(line)).toEqual({
      type: 'thinking',
      content: 'hmm',
    });
  });

  it('should parse a valid tool_use message', () => {
    const line = '{"type":"tool_use","name":"Bash","input":{"command":"ls"}}';
    expect(parseOutboundLine(line)).toEqual({
      type: 'tool_use',
      name: 'Bash',
      input: { command: 'ls' },
    });
  });

  it('should parse a valid question message', () => {
    const line =
      '{"type":"question","id":"q1","questions":[{"question":"Pick?"}]}';
    expect(parseOutboundLine(line)).toEqual({
      type: 'question',
      id: 'q1',
      questions: [{ question: 'Pick?' }],
    });
  });

  it('should parse a valid result message', () => {
    const line = '{"type":"result","result":"done"}';
    expect(parseOutboundLine(line)).toEqual({ type: 'result', result: 'done' });
  });

  it('should parse a valid error message', () => {
    const line = '{"type":"error","error":"something broke"}';
    expect(parseOutboundLine(line)).toEqual({
      type: 'error',
      error: 'something broke',
    });
  });

  it('should return null for invalid JSON', () => {
    expect(parseOutboundLine('not json')).toBeNull();
  });

  it('should return null for unknown type', () => {
    expect(parseOutboundLine('{"type":"unknown"}')).toBeNull();
  });

  it('should return null for inbound message type', () => {
    expect(parseOutboundLine('{"type":"prompt","prompt":"hello"}')).toBeNull();
  });
});

describe('parseInboundLine', () => {
  it('should parse a valid prompt message', () => {
    const line = '{"type":"prompt","prompt":"do stuff"}';
    expect(parseInboundLine(line)).toEqual({
      type: 'prompt',
      prompt: 'do stuff',
    });
  });

  it('should parse a valid answer message', () => {
    const line = '{"type":"answer","id":"q1","answers":{"Q":"A"}}';
    expect(parseInboundLine(line)).toEqual({
      type: 'answer',
      id: 'q1',
      answers: { Q: 'A' },
    });
  });

  it('should return null for invalid JSON', () => {
    expect(parseInboundLine('not json')).toBeNull();
  });

  it('should return null for outbound message type', () => {
    expect(parseInboundLine('{"type":"result","result":"x"}')).toBeNull();
  });
});
