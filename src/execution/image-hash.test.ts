import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeContextHash, needsRebuild } from './image-hash.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { readFile } from 'node:fs/promises';

const mockReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeContextHash', () => {
  it('should hash Dockerfile, init-firewall.sh, and agent-runner.js contents', async () => {
    mockReadFile.mockResolvedValueOnce('FROM node:20' as never);
    mockReadFile.mockResolvedValueOnce('#!/bin/bash' as never);
    mockReadFile.mockResolvedValueOnce('// agent runner' as never);

    const hash = await computeContextHash('/docker');

    expect(mockReadFile).toHaveBeenCalledWith('/docker/Dockerfile', 'utf-8');
    expect(mockReadFile).toHaveBeenCalledWith(
      '/docker/init-firewall.sh',
      'utf-8',
    );
    expect(mockReadFile).toHaveBeenCalledWith(
      '/docker/agent-runner.js',
      'utf-8',
    );
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different hashes for different content', async () => {
    mockReadFile.mockResolvedValueOnce('FROM node:20' as never);
    mockReadFile.mockResolvedValueOnce('#!/bin/bash' as never);
    mockReadFile.mockResolvedValueOnce('// v1' as never);
    const hash1 = await computeContextHash('/docker');

    mockReadFile.mockResolvedValueOnce('FROM node:22' as never);
    mockReadFile.mockResolvedValueOnce('#!/bin/bash' as never);
    mockReadFile.mockResolvedValueOnce('// v1' as never);
    const hash2 = await computeContextHash('/docker');

    expect(hash1).not.toBe(hash2);
  });
});

describe('needsRebuild', () => {
  it('should return true when no stored hash exists', async () => {
    // computeContextHash reads 3 files
    mockReadFile.mockResolvedValueOnce('FROM node:20' as never);
    mockReadFile.mockResolvedValueOnce('#!/bin/bash' as never);
    mockReadFile.mockResolvedValueOnce('// runner' as never);
    // getStoredHash read fails
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT') as never);

    const result = await needsRebuild('/docker');
    expect(result).toBe(true);
  });

  it('should return false when hash matches', async () => {
    // First call to compute hash
    mockReadFile.mockResolvedValueOnce('FROM node:20' as never);
    mockReadFile.mockResolvedValueOnce('#!/bin/bash' as never);
    mockReadFile.mockResolvedValueOnce('// runner' as never);

    // Get the expected hash
    const expectedHash = await computeContextHash('/docker');

    // Second call for needsRebuild
    mockReadFile.mockResolvedValueOnce('FROM node:20' as never);
    mockReadFile.mockResolvedValueOnce('#!/bin/bash' as never);
    mockReadFile.mockResolvedValueOnce('// runner' as never);
    // getStoredHash returns matching hash
    mockReadFile.mockResolvedValueOnce(expectedHash as never);

    const result = await needsRebuild('/docker');
    expect(result).toBe(false);
  });
});
