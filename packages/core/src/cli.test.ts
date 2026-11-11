import { execSync } from 'child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const CLI = path.join(__dirname, '..', 'dist', 'cli.js');

function runCli(args: string[]): string {
  return execSync(`node ${CLI} ${args.join(' ')}`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runCliJson(args: string[]): any {
  const output = runCli(args);
  return JSON.parse(output.trim());
}

function getDbPath(): string {
  return `/tmp/sentry-clip-cli-test-${Date.now()}.db`;
}

function cleanupDb(dbPath: string): void {
  try {
    fs.unlinkSync(dbPath);
  } catch {
    // ignore
  }
}

describe('CLI Interface', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = getDbPath();
  });

  afterEach(() => {
    cleanupDb(dbPath);
  });

  describe('help', () => {
    it('should display help message', () => {
      const output = runCli(['help']);
      expect(output).toContain('Sentry-Clip CLI');
      expect(output).toContain('list');
      expect(output).toContain('search');
      expect(output).toContain('add');
      expect(output).toContain('pin');
      expect(output).toContain('stats');
    });
  });

  describe('add', () => {
    it('should add a clip and return its details', () => {
      const output = runCli(['add', 'Hello World', '--db', dbPath]);
      expect(output).toContain('Clip added:');
      expect(output).toContain('Content: Hello World');
      expect(output).toContain('Pinned: false');
    });

    it('should return JSON when --json flag is used', () => {
      const clip = runCliJson(['add', 'JSON test content', '--json', '--db', dbPath]);
      expect(clip).toHaveProperty('id');
      expect(clip.content).toBe('JSON test content');
      expect(clip.pinned).toBe(false);
      expect(clip).toHaveProperty('hash');
      expect(clip).toHaveProperty('createdAt');
    });
  });

  describe('list', () => {
    it('should list all clips', () => {
      runCli(['add', 'Clip A', '--db', dbPath]);
      runCli(['add', 'Clip B', '--db', dbPath]);
      const output = runCli(['list', '--db', dbPath]);
      expect(output).toContain('Found 2 clip(s)');
      expect(output).toContain('Clip A');
      expect(output).toContain('Clip B');
    });

    it('should show "No clips found" when empty', () => {
      const output = runCli(['list', '--db', dbPath]);
      expect(output).toContain('No clips found.');
    });

    it('should filter by pinned clips', () => {
      runCli(['add', 'Unpinned clip', '--db', dbPath]);
      const clipId = runCliJson(['add', 'Pinned clip', '--json', '--db', dbPath]).id;
      runCli(['pin', clipId, '--db', dbPath]);
      const output = runCli(['list', '--pinned', '--db', dbPath]);
      expect(output).toContain('Found 1 clip(s)');
      expect(output).toContain('[PINNED]');
    });

    it('should support limit and offset pagination', () => {
      runCli(['add', 'First', '--db', dbPath]);
      runCli(['add', 'Second', '--db', dbPath]);
      runCli(['add', 'Third', '--db', dbPath]);
      const output = runCli(['list', '--limit', '1', '--offset', '1', '--db', dbPath]);
      expect(output).toContain('Found 1 clip(s)');
      expect(output).toContain('Second');
    });

    it('should output JSON when --json flag is used', () => {
      runCli(['add', 'JSON list', '--db', dbPath]);
      const clips = runCliJson(['list', '--json', '--db', dbPath]);
      expect(Array.isArray(clips)).toBe(true);
      expect(clips.length).toBe(1);
      expect(clips[0].content).toBe('JSON list');
    });
  });

  describe('search', () => {
    it('should search clips by content', () => {
      runCli(['add', 'Searchable content', '--db', dbPath]);
      runCli(['add', 'Different content', '--db', dbPath]);
      const output = runCli(['search', 'Searchable', '--db', dbPath]);
      expect(output).toContain('Found 1 clip(s) matching "Searchable"');
      expect(output).toContain('Searchable content');
    });

    it('should return no results for non-matching query', () => {
      runCli(['add', 'Some content', '--db', dbPath]);
      const output = runCli(['search', 'zzzznonexistent', '--db', dbPath]);
      expect(output).toContain('No clips found matching "zzzznonexistent"');
    });

    it('should support JSON output', () => {
      runCli(['add', 'Search test', '--db', dbPath]);
      const clips = runCliJson(['search', 'Search', '--json', '--db', dbPath]);
      expect(Array.isArray(clips)).toBe(true);
      expect(clips.length).toBe(1);
      expect(clips[0].content).toBe('Search test');
    });

    it('should support pinned filter with search', () => {
      runCli(['add', 'Unpinned search', '--db', dbPath]);
      const clipId = runCliJson(['add', 'Pinned search', '--json', '--db', dbPath]).id;
      runCli(['pin', clipId, '--db', dbPath]);
      const output = runCli(['search', 'search', '--pinned', '--db', dbPath]);
      expect(output).toContain('Found 1 clip(s)');
      expect(output).toContain('[PINNED]');
    });
  });

  describe('pin / unpin', () => {
    it('should pin a clip', () => {
      const clipId = runCliJson(['add', 'Pin me', '--json', '--db', dbPath]).id;
      const output = runCli(['pin', clipId, '--db', dbPath]);
      expect(output).toContain(`Pinned: ${clipId}`);
    });

    it('should unpin a clip', () => {
      const clipId = runCliJson(['add', 'Unpin me', '--json', '--db', dbPath]).id;
      runCli(['pin', clipId, '--db', dbPath]);
      const output = runCli(['unpin', clipId, '--db', dbPath]);
      expect(output).toContain(`Unpinned: ${clipId}`);
    });

    it('should error on pin for non-existent clip', () => {
      expect(() => runCli(['pin', 'nonexistent-id', '--db', dbPath])).toThrow();
    });

    it('should error on unpin for non-existent clip', () => {
      expect(() => runCli(['unpin', 'nonexistent-id', '--db', dbPath])).toThrow();
    });
  });

  describe('delete', () => {
    it('should delete a clip', () => {
      const clipId = runCliJson(['add', 'Delete me', '--json', '--db', dbPath]).id;
      const output = runCli(['delete', clipId, '--db', dbPath]);
      expect(output).toContain(`Deleted: ${clipId}`);
      const listOutput = runCli(['list', '--db', dbPath]);
      expect(listOutput).toContain('No clips found.');
    });

    it('should error on delete for non-existent clip', () => {
      expect(() => runCli(['delete', 'nonexistent-id', '--db', dbPath])).toThrow();
    });
  });

  describe('stats', () => {
    it('should show stats', () => {
      runCli(['add', 'Clip 1', '--db', dbPath]);
      runCli(['add', 'Clip 2', '--db', dbPath]);
      const output = runCli(['stats', '--db', dbPath]);
      expect(output).toContain('Sentry-Clip Stats');
      expect(output).toContain('Total clips: 2');
    });

    it('should output JSON', () => {
      runCli(['add', 'Stats test', '--db', dbPath]);
      const stats = runCliJson(['stats', '--json', '--db', dbPath]);
      expect(stats).toHaveProperty('totalClips');
      expect(stats).toHaveProperty('pinnedClips');
      expect(stats).toHaveProperty('totalSnippets');
      expect(stats).toHaveProperty('totalMaskRules');
      expect(stats.totalClips).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all clips', () => {
      runCli(['add', 'Clear me', '--db', dbPath]);
      const output = runCli(['clear', '--db', dbPath]);
      expect(output).toContain('Cleared 1 clip(s).');
      const listOutput = runCli(['list', '--db', dbPath]);
      expect(listOutput).toContain('No clips found.');
    });
  });

  describe('snippets', () => {
    it('should list snippets (empty)', () => {
      const output = runCli(['snippets', '--db', dbPath]);
      expect(output).toContain('No snippets found.');
    });

    it('should add a snippet', () => {
      const output = runCli(['snippet-add', 'my-snippet', 'Hello {{name}}', '--db', dbPath]);
      expect(output).toContain('Snippet added:');
      expect(output).toContain('my-snippet');
    });

    it('should list snippets after adding', () => {
      runCli(['snippet-add', 'test-snippet', 'Test content', '--db', dbPath]);
      const output = runCli(['snippets', '--db', dbPath]);
      expect(output).toContain('Found 1 snippet(s)');
      expect(output).toContain('test-snippet');
    });

    it('should delete a snippet', () => {
      const snippetId = runCliJson(['snippet-add', 'del-snippet', 'Content', '--json', '--db', dbPath]).id;
      const output = runCli(['snippet-delete', snippetId, '--db', dbPath]);
      expect(output).toContain(`Deleted snippet: ${snippetId}`);
    });

    it('should error on snippet-delete for non-existent snippet', () => {
      expect(() => runCli(['snippet-delete', 'nonexistent', '--db', dbPath])).toThrow();
    });
  });

  describe('error handling', () => {
    it('should error when search has no query', () => {
      expect(() => runCli(['search', '--db', dbPath])).toThrow();
    });

    it('should error when add has no content', () => {
      expect(() => runCli(['add', '--db', dbPath])).toThrow();
    });

    it('should error when pin has no id', () => {
      expect(() => runCli(['pin', '--db', dbPath])).toThrow();
    });

    it('should error when unpin has no id', () => {
      expect(() => runCli(['unpin', '--db', dbPath])).toThrow();
    });

    it('should error when delete has no id', () => {
      expect(() => runCli(['delete', '--db', dbPath])).toThrow();
    });

    it('should error when snippet-add has insufficient args', () => {
      expect(() => runCli(['snippet-add', '--db', dbPath])).toThrow();
    });
  });
});
