import { execFileSync } from 'child_process';
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { runCli, parseArgs, resolveDbPath, CliError } from './cli';

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function makeDbPath(): string {
  return path.join(
    os.tmpdir(),
    `sentry-clip-cli-test-${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.db`
  );
}

function cleanupDb(dbPath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // ignore
    }
  }
}

/** Run the CLI in-process with an isolated database. */
function run(args: string[], dbPath: string): CliResult {
  let stdout = '';
  let stderr = '';
  const code = runCli([...args, '--db', dbPath], {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    env: {},
  });
  return { code, stdout, stderr };
}

function runOk(args: string[], dbPath: string): string {
  const result = run(args, dbPath);
  if (result.code !== 0) {
    throw new Error(`CLI failed (${result.code}): ${result.stderr}`);
  }
  return result.stdout;
}

function runJson(args: string[], dbPath: string): any {
  return JSON.parse(runOk([...args, '--json'], dbPath).trim());
}

/** Small pause so clips created back-to-back get distinct createdAt values. */
function tick(): void {
  const start = Date.now();
  while (Date.now() - start < 3) {
    // busy wait
  }
}

describe('parseArgs', () => {
  it('treats the first non-option token as the command', () => {
    const parsed = parseArgs(['search', 'search', '--pinned']);
    expect(parsed.command).toBe('search');
    expect(parsed.positional).toEqual(['search']);
    expect(parsed.options.pinned).toBe(true);
  });

  it('parses --limit, --offset, --json and --db', () => {
    const parsed = parseArgs(['list', '--limit', '5', '--offset', '2', '--json', '--db', 'x.db']);
    expect(parsed.options).toEqual({ limit: 5, offset: 2, json: true, db: 'x.db' });
  });

  it('defaults to help with no arguments', () => {
    expect(parseArgs([]).command).toBe('help');
  });

  it('treats arguments after -- as positional', () => {
    const parsed = parseArgs(['add', '--', '--json']);
    expect(parsed.positional).toEqual(['--json']);
    expect(parsed.options.json).toBeUndefined();
  });

  it('rejects invalid numeric options and unknown flags', () => {
    expect(() => parseArgs(['list', '--limit', 'abc'])).toThrow(CliError);
    expect(() => parseArgs(['list', '--limit'])).toThrow(CliError);
    expect(() => parseArgs(['list', '--bogus'])).toThrow(CliError);
  });
});

describe('resolveDbPath', () => {
  it('prefers --db, then SENTRY_CLIP_DB, then home directory', () => {
    expect(resolveDbPath('a.db', { SENTRY_CLIP_DB: 'b.db' })).toBe('a.db');
    expect(resolveDbPath(undefined, { SENTRY_CLIP_DB: 'b.db' })).toBe('b.db');
    expect(resolveDbPath(undefined, {})).toBe(path.join(os.homedir(), '.sentry-clip', 'clips.db'));
  });
});

describe('CLI Interface (in-process)', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = makeDbPath();
  });

  afterEach(() => {
    cleanupDb(dbPath);
  });

  describe('help', () => {
    it('should display help message', () => {
      const output = runOk(['help'], dbPath);
      expect(output).toContain('Sentry-Clip CLI');
      expect(output).toContain('list');
      expect(output).toContain('search');
      expect(output).toContain('add');
      expect(output).toContain('pin');
      expect(output).toContain('stats');
    });

    it('should error on unknown command', () => {
      const result = run(['frobnicate'], dbPath);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Unknown command: frobnicate');
    });
  });

  describe('add', () => {
    it('should add a clip and return its details', () => {
      const output = runOk(['add', 'Hello World'], dbPath);
      expect(output).toContain('Clip added:');
      expect(output).toContain('Content: Hello World');
      expect(output).toContain('Pinned: false');
    });

    it('should return JSON when --json flag is used', () => {
      const clip = runJson(['add', 'JSON test content'], dbPath);
      expect(clip).toHaveProperty('id');
      expect(clip.content).toBe('JSON test content');
      expect(clip.pinned).toBe(false);
      expect(clip).toHaveProperty('hash');
      expect(clip).toHaveProperty('createdAt');
    });

    it('should join multiple positional words into one clip', () => {
      const clip = runJson(['add', 'multi', 'word', 'clip'], dbPath);
      expect(clip.content).toBe('multi word clip');
    });
  });

  describe('list', () => {
    it('should list all clips', () => {
      runOk(['add', 'Clip A'], dbPath);
      tick();
      runOk(['add', 'Clip B'], dbPath);
      const output = runOk(['list'], dbPath);
      expect(output).toContain('Found 2 clip(s)');
      expect(output).toContain('Clip A');
      expect(output).toContain('Clip B');
    });

    it('should show "No clips found" when empty', () => {
      const output = runOk(['list'], dbPath);
      expect(output).toContain('No clips found.');
    });

    it('should filter by pinned clips', () => {
      runOk(['add', 'Unpinned clip'], dbPath);
      const clipId = runJson(['add', 'Pinned clip'], dbPath).id;
      runOk(['pin', clipId], dbPath);
      const output = runOk(['list', '--pinned'], dbPath);
      expect(output).toContain('Found 1 clip(s)');
      expect(output).toContain('[PINNED]');
      expect(output).toContain('Pinned clip');
      expect(output).not.toContain('Unpinned clip');
    });

    it('should support limit and offset pagination (newest first)', () => {
      runOk(['add', 'First'], dbPath);
      tick();
      runOk(['add', 'Second'], dbPath);
      tick();
      runOk(['add', 'Third'], dbPath);
      const output = runOk(['list', '--limit', '1', '--offset', '1'], dbPath);
      expect(output).toContain('Found 1 clip(s)');
      expect(output).toContain('Second');
    });

    it('should support offset without limit', () => {
      runOk(['add', 'First'], dbPath);
      tick();
      runOk(['add', 'Second'], dbPath);
      const clips = runJson(['list', '--offset', '1'], dbPath);
      expect(clips.length).toBe(1);
      expect(clips[0].content).toBe('First');
    });

    it('should output JSON when --json flag is used', () => {
      runOk(['add', 'JSON list'], dbPath);
      const clips = runJson(['list'], dbPath);
      expect(Array.isArray(clips)).toBe(true);
      expect(clips.length).toBe(1);
      expect(clips[0].content).toBe('JSON list');
    });

    it('should output an empty JSON array when there are no clips', () => {
      expect(runJson(['list'], dbPath)).toEqual([]);
    });
  });

  describe('search', () => {
    it('should search clips by content', () => {
      runOk(['add', 'Searchable content'], dbPath);
      runOk(['add', 'Different content'], dbPath);
      const output = runOk(['search', 'Searchable'], dbPath);
      expect(output).toContain('Found 1 clip(s) matching "Searchable"');
      expect(output).toContain('Searchable content');
    });

    it('should return no results for non-matching query', () => {
      runOk(['add', 'Some content'], dbPath);
      const output = runOk(['search', 'zzzznonexistent'], dbPath);
      expect(output).toContain('No clips found matching "zzzznonexistent"');
    });

    it('should support JSON output', () => {
      runOk(['add', 'Search test'], dbPath);
      const clips = runJson(['search', 'Search'], dbPath);
      expect(Array.isArray(clips)).toBe(true);
      expect(clips.length).toBe(1);
      expect(clips[0].content).toBe('Search test');
    });

    it('should support pinned filter with search', () => {
      runOk(['add', 'Unpinned search'], dbPath);
      const clipId = runJson(['add', 'Pinned search'], dbPath).id;
      runOk(['pin', clipId], dbPath);
      const output = runOk(['search', 'search', '--pinned'], dbPath);
      expect(output).toContain('Found 1 clip(s)');
      expect(output).toContain('[PINNED]');
      expect(output).toContain('Pinned search');
    });

    it('should fall back to substring matching for partial words', () => {
      runOk(['add', 'configuration file'], dbPath);
      const clips = runJson(['search', 'figur'], dbPath);
      expect(clips.length).toBe(1);
      expect(clips[0].content).toBe('configuration file');
    });

    it('should not crash on FTS syntax characters', () => {
      runOk(['add', 'foo-bar (baz)'], dbPath);
      const result = run(['search', 'foo-bar (', '--json'], dbPath);
      expect(result.code).toBe(0);
      const clips = JSON.parse(result.stdout.trim());
      expect(clips.length).toBe(1);
    });

    it('should search for words that are also command names', () => {
      runOk(['add', 'shopping list for today'], dbPath);
      const clips = runJson(['search', 'list'], dbPath);
      expect(clips.length).toBe(1);
      expect(clips[0].content).toBe('shopping list for today');
    });

    it('should apply --limit to search results', () => {
      runOk(['add', 'alpha one'], dbPath);
      runOk(['add', 'alpha two'], dbPath);
      runOk(['add', 'alpha three'], dbPath);
      const clips = runJson(['search', 'alpha', '--limit', '2'], dbPath);
      expect(clips.length).toBe(2);
    });
  });

  describe('pin / unpin', () => {
    it('should pin a clip', () => {
      const clipId = runJson(['add', 'Pin me'], dbPath).id;
      const output = runOk(['pin', clipId], dbPath);
      expect(output).toContain(`Pinned: ${clipId}`);
      const clips = runJson(['list', '--pinned'], dbPath);
      expect(clips.map((c: any) => c.id)).toEqual([clipId]);
    });

    it('should unpin a clip', () => {
      const clipId = runJson(['add', 'Unpin me'], dbPath).id;
      runOk(['pin', clipId], dbPath);
      const output = runOk(['unpin', clipId], dbPath);
      expect(output).toContain(`Unpinned: ${clipId}`);
      expect(runJson(['list', '--pinned'], dbPath)).toEqual([]);
    });

    it('should error on pin for non-existent clip', () => {
      const result = run(['pin', 'nonexistent-id'], dbPath);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Clip not found: nonexistent-id');
    });

    it('should error on unpin for non-existent clip', () => {
      expect(run(['unpin', 'nonexistent-id'], dbPath).code).toBe(1);
    });
  });

  describe('delete', () => {
    it('should delete a clip', () => {
      const clipId = runJson(['add', 'Delete me'], dbPath).id;
      const output = runOk(['delete', clipId], dbPath);
      expect(output).toContain(`Deleted: ${clipId}`);
      expect(runOk(['list'], dbPath)).toContain('No clips found.');
    });

    it('should error on delete for non-existent clip', () => {
      expect(run(['delete', 'nonexistent-id'], dbPath).code).toBe(1);
    });
  });

  describe('stats', () => {
    it('should show stats', () => {
      runOk(['add', 'Clip 1'], dbPath);
      runOk(['add', 'Clip 2'], dbPath);
      const output = runOk(['stats'], dbPath);
      expect(output).toContain('Sentry-Clip Stats');
      expect(output).toContain('Total clips: 2');
    });

    it('should output JSON', () => {
      runOk(['add', 'Stats test'], dbPath);
      const stats = runJson(['stats'], dbPath);
      expect(stats).toHaveProperty('totalClips');
      expect(stats).toHaveProperty('pinnedClips');
      expect(stats).toHaveProperty('totalSnippets');
      expect(stats).toHaveProperty('totalMaskRules');
      expect(stats.totalClips).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all clips', () => {
      runOk(['add', 'Clear me'], dbPath);
      const output = runOk(['clear'], dbPath);
      expect(output).toContain('Cleared 1 clip(s).');
      expect(runOk(['list'], dbPath)).toContain('No clips found.');
    });
  });

  describe('snippets', () => {
    it('should list snippets (empty)', () => {
      expect(runOk(['snippets'], dbPath)).toContain('No snippets found.');
    });

    it('should add a snippet', () => {
      const output = runOk(['snippet-add', 'my-snippet', 'Hello {{name}}'], dbPath);
      expect(output).toContain('Snippet added:');
      expect(output).toContain('my-snippet');
    });

    it('should list snippets after adding', () => {
      runOk(['snippet-add', 'test-snippet', 'Test content'], dbPath);
      const output = runOk(['snippets'], dbPath);
      expect(output).toContain('Found 1 snippet(s)');
      expect(output).toContain('test-snippet');
    });

    it('should return pure JSON from snippet-add --json', () => {
      const snippet = runJson(['snippet-add', 'json-snippet', 'Hi {{name}}'], dbPath);
      expect(snippet.name).toBe('json-snippet');
      expect(snippet.content).toBe('Hi {{name}}');
      expect(snippet.placeholders).toContain('name');
    });

    it('should delete a snippet', () => {
      const snippetId = runJson(['snippet-add', 'del-snippet', 'Content'], dbPath).id;
      const output = runOk(['snippet-delete', snippetId], dbPath);
      expect(output).toContain(`Deleted snippet: ${snippetId}`);
    });

    it('should error on snippet-delete for non-existent snippet', () => {
      expect(run(['snippet-delete', 'nonexistent'], dbPath).code).toBe(1);
    });
  });

  describe('error handling', () => {
    it.each([
      [['search']],
      [['add']],
      [['pin']],
      [['unpin']],
      [['delete']],
      [['snippet-add']],
      [['snippet-add', 'name-only']],
      [['snippet-delete']],
    ])('should exit 1 with usage for %j', (args) => {
      const result = run(args, dbPath);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Usage:');
    });
  });

  describe('persistence', () => {
    it('should persist clips across separate invocations', () => {
      const clipId = runJson(['add', 'persisted clip'], dbPath).id;
      runOk(['pin', clipId], dbPath);
      const clips = runJson(['list'], dbPath);
      expect(clips.length).toBe(1);
      expect(clips[0].id).toBe(clipId);
      expect(clips[0].pinned).toBe(true);
    });

    it('should use SENTRY_CLIP_DB when --db is not given', () => {
      let stdout = '';
      const env = { SENTRY_CLIP_DB: dbPath };
      expect(runCli(['add', 'env clip'], { stdout: () => {}, stderr: () => {}, env })).toBe(0);
      expect(
        runCli(['list', '--json'], {
          stdout: (t) => {
            stdout += t;
          },
          stderr: () => {},
          env,
        })
      ).toBe(0);
      const clips = JSON.parse(stdout.trim());
      expect(clips[0].content).toBe('env clip');
    });

    it('should create the database directory if missing', () => {
      const dir = path.join(os.tmpdir(), `sentry-clip-cli-dir-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
      const nestedDb = path.join(dir, 'nested', 'clips.db');
      try {
        runOk(['add', 'nested'], nestedDb);
        expect(fs.existsSync(nestedDb)).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

/**
 * Headless binary check: compiles the core package and runs dist/cli.js in a
 * real child process, exactly as `npx sentry-clip` would.
 */
describe('CLI binary (headless child process)', () => {
  const coreDir = path.join(__dirname, '..');
  const cliJs = path.join(coreDir, 'dist', 'cli.js');
  let dbPath: string;

  function exec(args: string[]): string {
    return execFileSync(process.execPath, [cliJs, ...args, '--db', dbPath], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  beforeAll(() => {
    const tsc = createRequire(__filename).resolve('typescript/bin/tsc');
    execFileSync(process.execPath, [tsc, '-p', path.join(coreDir, 'tsconfig.json')], {
      stdio: 'pipe',
    });
  }, 120_000);

  beforeEach(() => {
    dbPath = makeDbPath();
  });

  afterEach(() => {
    cleanupDb(dbPath);
  });

  it('has a node shebang so npx can execute it', () => {
    expect(fs.readFileSync(cliJs, 'utf-8').startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('adds, lists and searches clips across processes', () => {
    exec(['add', 'Headless clip one']);
    exec(['add', 'Another headless entry']);

    const listed = JSON.parse(exec(['list', '--json']).trim());
    expect(listed.length).toBe(2);

    const listText = exec(['list']);
    expect(listText).toContain('Found 2 clip(s)');

    const found = JSON.parse(exec(['search', 'one', '--json']).trim());
    expect(found.length).toBe(1);
    expect(found[0].content).toBe('Headless clip one');
  }, 30_000);

  it('exits non-zero on errors', () => {
    expect(() => exec(['pin', 'does-not-exist'])).toThrow();
    expect(() => exec(['search'])).toThrow();
  }, 30_000);
});
