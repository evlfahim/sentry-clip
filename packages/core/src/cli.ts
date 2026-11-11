#!/usr/bin/env node
/**
 * CLI interface for @sentry-clip/core (headless operation).
 *
 * Usage:
 *   npx sentry-clip list [--pinned] [--limit N] [--offset N] [--json] [--db path]
 *   npx sentry-clip search <query> [--pinned] [--limit N] [--offset N] [--json] [--db path]
 *   npx sentry-clip add <content> [--json] [--db path]
 *   npx sentry-clip pin <id> [--db path]
 *   npx sentry-clip unpin <id> [--db path]
 *   npx sentry-clip delete <id> [--db path]
 *   npx sentry-clip stats [--json] [--db path]
 *   npx sentry-clip clear [--db path]
 *   npx sentry-clip snippets [--json] [--db path]
 *   npx sentry-clip snippet-add <name> <content> [--json] [--db path]
 *   npx sentry-clip snippet-delete <id> [--db path]
 *   npx sentry-clip help
 *
 * Database location: --db <path>, else $SENTRY_CLIP_DB, else ~/.sentry-clip/clips.db
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HistoryManager } from './history';
import { SnippetEngine } from './snippets';
import { Clip, Snippet } from './models';

export const CLI_COMMANDS = [
  'list',
  'search',
  'add',
  'pin',
  'unpin',
  'delete',
  'stats',
  'clear',
  'snippets',
  'snippet-add',
  'snippet-delete',
  'help',
] as const;

export type CliCommand = (typeof CLI_COMMANDS)[number];

export interface CliOptions {
  db?: string;
  json?: boolean;
  pinned?: boolean;
  limit?: number;
  offset?: number;
}

export interface ParsedArgs {
  command: string;
  positional: string[];
  options: CliOptions;
}

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env?: Record<string, string | undefined>;
}

/** Error raised for user-facing CLI failures; results in exit code 1. */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

function parseNonNegativeInt(flag: string, value: string | undefined): number {
  if (value === undefined) {
    throw new CliError(`Missing value for ${flag}`);
  }
  if (!/^\d+$/.test(value)) {
    throw new CliError(`Invalid value for ${flag}: ${value} (expected a non-negative integer)`);
  }
  return parseInt(value, 10);
}

/**
 * Parse argv (without node/script). The first non-option token is the command;
 * all later non-option tokens are positional, so `search list` searches for "list".
 * Everything after `--` is positional.
 */
export function parseArgs(args: string[]): ParsedArgs {
  let command = '';
  const positional: string[] = [];
  const options: CliOptions = {};
  let optionsEnded = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!optionsEnded && arg === '--') {
      optionsEnded = true;
      continue;
    }

    if (!optionsEnded && arg.startsWith('-') && arg.length > 1) {
      switch (arg) {
        case '--db':
          if (i + 1 >= args.length) {
            throw new CliError('Missing value for --db');
          }
          options.db = args[++i];
          break;
        case '--json':
          options.json = true;
          break;
        case '--pinned':
          options.pinned = true;
          break;
        case '--limit':
          options.limit = parseNonNegativeInt('--limit', args[++i]);
          break;
        case '--offset':
          options.offset = parseNonNegativeInt('--offset', args[++i]);
          break;
        case '-h':
        case '--help':
          command = 'help';
          break;
        default:
          throw new CliError(`Unknown option: ${arg}`);
      }
      continue;
    }

    if (command === '') {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command: command || 'help', positional, options };
}

/** Resolve the SQLite database path used by the CLI. */
export function resolveDbPath(dbOption: string | undefined, env: Record<string, string | undefined>): string {
  if (dbOption) return dbOption;
  if (env.SENTRY_CLIP_DB) return env.SENTRY_CLIP_DB;
  return path.join(os.homedir(), '.sentry-clip', 'clips.db');
}

function ensureDbDir(dbPath: string): void {
  if (dbPath === ':memory:') return;
  const dir = path.dirname(path.resolve(dbPath));
  fs.mkdirSync(dir, { recursive: true });
}

function preview(content: string): string {
  const singleLine = content.replace(/\r?\n/g, ' ');
  return singleLine.length > 100 ? singleLine.substring(0, 100) + '...' : singleLine;
}

function formatClips(manager: HistoryManager, clips: Clip[]): string {
  const lines: string[] = [];
  for (const clip of clips) {
    const time = manager.getRelativeTime(clip.createdAt);
    const pinLabel = clip.pinned ? '[PINNED] ' : '';
    lines.push(`  ${pinLabel}${clip.id}  (${time})`);
    lines.push(`    ${preview(clip.content)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function paginate<T>(items: T[], options: CliOptions): T[] {
  const start = options.offset ?? 0;
  const end = options.limit !== undefined ? start + options.limit : undefined;
  return items.slice(start, end);
}

/**
 * Search clips: FTS5 first, falling back to a case-insensitive substring match
 * when FTS finds nothing or rejects the query syntax (e.g. "foo-bar", "a*b(").
 */
export function searchClips(manager: HistoryManager, query: string, options: CliOptions): Clip[] {
  const pinned = options.pinned ? true : undefined;

  let ftsResults: Clip[] = [];
  try {
    ftsResults = manager.searchClipsAdvanced({ query, pinned });
  } catch {
    ftsResults = [];
  }

  if (ftsResults.length > 0) {
    return paginate(ftsResults, options);
  }

  const needle = query.toLowerCase();
  const substringResults = manager
    .getClips({ pinned })
    .filter((clip) => clip.content.toLowerCase().includes(needle));
  return paginate(substringResults, options);
}

function findClip(manager: HistoryManager, clipId: string): Clip | undefined {
  return manager.getClips().find((c) => c.id === clipId);
}

function requireArg(positional: string[], usage: string): string {
  if (positional.length === 0 || positional[0].trim() === '') {
    throw new CliError(`Usage: ${usage}`);
  }
  return positional[0];
}

export const HELP_TEXT = `
Sentry-Clip CLI - Secure clipboard manager

Usage:
  npx sentry-clip <command> [options]

Commands:
  list                          List all clips (or pinned with --pinned)
  search <query>                Search clips by content
  add <content>                 Add a new clip
  pin <id>                      Pin a clip by ID
  unpin <id>                    Unpin a clip by ID
  delete <id>                   Delete a clip by ID
  stats                         Show clip/snippet/mask stats
  clear                         Clear all clips
  snippets                      List all snippets
  snippet-add <name> <content>  Add a snippet
  snippet-delete <id>           Delete a snippet
  help                          Show this help message

Options:
  --db <path>       SQLite database path (default: $SENTRY_CLIP_DB or ~/.sentry-clip/clips.db)
  --json            Output results as JSON
  --pinned          Filter to pinned clips only
  --limit <N>       Limit number of results
  --offset <N>      Offset for pagination
  --                Treat all following arguments as positional

Examples:
  npx sentry-clip list
  npx sentry-clip search "password" --json
  npx sentry-clip add "hello world"
  npx sentry-clip pin abc123
  npx sentry-clip stats --json
  npx sentry-clip list --pinned --limit 10
`;

function execute(manager: HistoryManager, parsed: ParsedArgs, out: (text: string) => void): void {
  const { command, positional, options } = parsed;
  const json = (data: unknown) => out(JSON.stringify(data, null, 2));

  switch (command as CliCommand) {
    case 'list': {
      const all = manager.getClips({ pinned: options.pinned ? true : undefined });
      const clips = paginate(all, options);
      if (options.json) return json(clips);
      if (clips.length === 0) return out('No clips found.');
      out(`Found ${clips.length} clip(s):\n`);
      out(formatClips(manager, clips));
      return;
    }

    case 'search': {
      requireArg(positional, 'sentry-clip search <query>');
      const query = positional.join(' ');
      const clips = searchClips(manager, query, options);
      if (options.json) return json(clips);
      if (clips.length === 0) return out(`No clips found matching "${query}".`);
      out(`Found ${clips.length} clip(s) matching "${query}":\n`);
      out(formatClips(manager, clips));
      return;
    }

    case 'add': {
      requireArg(positional, 'sentry-clip add <content>');
      const clip = manager.addClip(positional.join(' '));
      if (!clip.id) {
        throw new CliError('Failed to add clip (empty content or excluded by patterns).');
      }
      if (options.json) return json(clip);
      out(`Clip added: ${clip.id}`);
      out(`  Content: ${clip.content}`);
      out(`  Pinned: ${clip.pinned}`);
      out(`  Hash: ${clip.hash}`);
      return;
    }

    case 'pin': {
      const clipId = requireArg(positional, 'sentry-clip pin <id>');
      if (!findClip(manager, clipId)) throw new CliError(`Clip not found: ${clipId}`);
      manager.pinClip(clipId);
      if (options.json) return json({ id: clipId, pinned: true });
      out(`Pinned: ${clipId}`);
      return;
    }

    case 'unpin': {
      const clipId = requireArg(positional, 'sentry-clip unpin <id>');
      if (!findClip(manager, clipId)) throw new CliError(`Clip not found: ${clipId}`);
      manager.unpinClip(clipId);
      if (options.json) return json({ id: clipId, pinned: false });
      out(`Unpinned: ${clipId}`);
      return;
    }

    case 'delete': {
      const clipId = requireArg(positional, 'sentry-clip delete <id>');
      if (!manager.deleteClip(clipId)) throw new CliError(`Clip not found: ${clipId}`);
      if (options.json) return json({ id: clipId, deleted: true });
      out(`Deleted: ${clipId}`);
      return;
    }

    case 'stats': {
      const stats = manager.getStats();
      if (options.json) return json(stats);
      out('Sentry-Clip Stats:');
      out(`  Total clips: ${stats.totalClips}`);
      out(`  Pinned clips: ${stats.pinnedClips}`);
      out(`  Total snippets: ${stats.totalSnippets}`);
      out(`  Total mask rules: ${stats.totalMaskRules}`);
      return;
    }

    case 'clear': {
      const count = manager.clearHistory();
      if (options.json) return json({ cleared: count });
      out(`Cleared ${count} clip(s).`);
      return;
    }

    case 'snippets': {
      const snippets = manager.getAllSnippets();
      if (options.json) return json(snippets);
      if (snippets.length === 0) return out('No snippets found.');
      out(`Found ${snippets.length} snippet(s):\n`);
      for (const snippet of snippets) {
        out(`  ${snippet.id}  (${snippet.name})`);
        out(`    ${preview(snippet.content)}`);
        if (snippet.placeholders.length > 0) {
          out(`    Placeholders: ${snippet.placeholders.join(', ')}`);
        }
        out('');
      }
      return;
    }

    case 'snippet-add': {
      if (positional.length < 2) {
        throw new CliError('Usage: sentry-clip snippet-add <name> <content>');
      }
      const name = positional[0];
      const content = positional.slice(1).join(' ');
      const snippet: Snippet = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name,
        content,
        placeholders: new SnippetEngine().extractPlaceholders(content),
        createdAt: Date.now(),
      };
      manager.addSnippet(snippet);
      if (options.json) return json(snippet);
      out(`Snippet added: ${snippet.id} (${snippet.name})`);
      return;
    }

    case 'snippet-delete': {
      const snippetId = requireArg(positional, 'sentry-clip snippet-delete <id>');
      if (!manager.deleteSnippet(snippetId)) throw new CliError(`Snippet not found: ${snippetId}`);
      if (options.json) return json({ id: snippetId, deleted: true });
      out(`Deleted snippet: ${snippetId}`);
      return;
    }

    default:
      throw new CliError(`Unknown command: ${command}. Run "sentry-clip help" for usage.`);
  }
}

/**
 * Run the CLI with the given arguments. Returns the process exit code
 * (0 = success, 1 = error). Never calls process.exit, so it is safe to embed.
 */
export function runCli(argv: string[], io?: Partial<CliIO>): number {
  const stdout = io?.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io?.stderr ?? ((text: string) => process.stderr.write(text));
  const env = io?.env ?? process.env;
  const out = (text: string) => stdout(text + '\n');

  let manager: HistoryManager | null = null;
  try {
    const parsed = parseArgs(argv);

    if (parsed.command === 'help') {
      out(HELP_TEXT);
      return 0;
    }
    if (!(CLI_COMMANDS as readonly string[]).includes(parsed.command)) {
      throw new CliError(`Unknown command: ${parsed.command}. Run "sentry-clip help" for usage.`);
    }

    const dbPath = resolveDbPath(parsed.options.db, env);
    ensureDbDir(dbPath);
    manager = new HistoryManager({ dbPath });
    execute(manager, parsed, out);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr('Error: ' + message + '\n');
    return 1;
  } finally {
    if (manager) {
      manager.close();
    }
  }
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  process.exitCode = runCli(process.argv.slice(2));
}
