#!/usr/bin/env node
import { readFileSync, appendFileSync } from 'node:fs';

const phase = process.argv[2] || 'unknown';
const logFile = '/Users/jake/dev/agent-harness/demo/hook-capture.log';

try {
  const input = readFileSync(0, 'utf-8');
  const ts = new Date().toISOString();
  appendFileSync(logFile, `\n=== ${phase.toUpperCase()} [${ts}] ===\n${input}\n`, 'utf-8');
} catch (err) {
  appendFileSync(logFile, `\nERROR: ${err.message}\n`, 'utf-8');
}
