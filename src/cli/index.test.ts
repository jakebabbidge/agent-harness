import { describe, it, expect, vi } from 'vitest';

vi.mock('../execution/container-lifecycle.js', () => ({
  executeRun: vi.fn(),
  executeLogin: vi.fn(),
}));

vi.mock('../prompts/index.js', () => ({
  renderTemplate: vi.fn(),
}));

vi.mock('../run-session/index.js', () => ({
  RunSession: vi.fn(),
}));

vi.mock('../ui/render.js', () => ({
  renderApp: vi.fn(() => ({ unmount: vi.fn(), waitUntilExit: vi.fn() })),
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
    expect(runCmd!.description()).toContain('prompt template');
  });

  it('run command should accept a template argument', () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
    const args = runCmd!.registeredArguments;
    expect(args).toHaveLength(1);
    expect(args[0].required).toBe(true);
  });

  it('run command should have a --var option', () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
    const varOption = runCmd!.options.find((opt) => opt.long === '--var');
    expect(varOption).toBeDefined();
  });

  it('should have a dry-run command registered', () => {
    const dryRunCmd = program.commands.find((cmd) => cmd.name() === 'dry-run');
    expect(dryRunCmd).toBeDefined();
    expect(dryRunCmd!.description()).toContain('Render');
  });

  it('dry-run command should accept a template argument', () => {
    const dryRunCmd = program.commands.find((cmd) => cmd.name() === 'dry-run');
    const args = dryRunCmd!.registeredArguments;
    expect(args).toHaveLength(1);
    expect(args[0].required).toBe(true);
  });

  it('dry-run command should have a --var option', () => {
    const dryRunCmd = program.commands.find((cmd) => cmd.name() === 'dry-run');
    const varOption = dryRunCmd!.options.find((opt) => opt.long === '--var');
    expect(varOption).toBeDefined();
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
