import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusIcon } from './StatusIcon.js';

describe('StatusIcon', () => {
  it('should render a dash for pending status', () => {
    const { lastFrame } = render(<StatusIcon status="pending" />);
    expect(lastFrame()).toContain('-');
  });

  it('should render a spinner for running status', () => {
    const { lastFrame } = render(<StatusIcon status="running" />);
    // Spinner renders a character that changes; just verify it renders something
    expect(lastFrame()).toBeTruthy();
  });

  it('should render a question mark for blocked status', () => {
    const { lastFrame } = render(<StatusIcon status="blocked" />);
    expect(lastFrame()).toContain('?');
  });

  it('should render a checkmark for completed status', () => {
    const { lastFrame } = render(<StatusIcon status="completed" />);
    expect(lastFrame()).toContain('✓');
  });

  it('should render a cross for failed status', () => {
    const { lastFrame } = render(<StatusIcon status="failed" />);
    expect(lastFrame()).toContain('✗');
  });
});
