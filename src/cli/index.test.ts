import { describe, it, expect, vi } from 'vitest';

vi.mock('../execution/container-lifecycle.js', () => ({
  executeRun: vi.fn(),
  executeLogin: vi.fn(),
}));

vi.mock('./prompt.js', () => ({
  promptUserForAnswer: vi.fn(),
}));

import { program } from './index.js';

describe('CLI entry point', () => {
  it('should have the correct program name', () => {
    expect(program.name()).toBe('agent-harness');
  });

  it('should have a version set', () => {
    expect(program.version()).toBe('0.1.0');
  });

  it('should have a description set', () => {
    expect(program.description()).toBeTruthy();
  });
});

describe('CLI commands', () => {
  it('should have a run command registered', () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCmd).toBeDefined();
    expect(runCmd!.description()).toContain('Run Claude Code');
  });

  it('run command should accept a prompt argument', () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
    const args = runCmd!.registeredArguments;
    expect(args).toHaveLength(1);
    expect(args[0].required).toBe(true);
  });

  it('should have a login command registered', () => {
    const loginCmd = program.commands.find((cmd) => cmd.name() === 'login');
    expect(loginCmd).toBeDefined();
    expect(loginCmd!.description()).toContain('login');
  });

  it('login command should accept no arguments', () => {
    const loginCmd = program.commands.find((cmd) => cmd.name() === 'login');
    expect(loginCmd!.registeredArguments).toHaveLength(0);
  });
});
