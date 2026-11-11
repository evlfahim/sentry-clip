#!/usr/bin/env node
/**
 * CLI interface for @sentry-clip/core
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
 *   npx sentry-clip help
 */

import { HistoryManager } from './history';
import { SnippetEngine } from './snippets';
import { MaskEngine } from './masking';
import { Snippet } from './models';

type CliCommand = 'list' | 'search' | 'add' | 'pin' | 'unpin' | 'delete' | 'stats' | 'clear' | 'help' | 'snippets' | 'snippet-add' | 'snippet-delete' | 'snippet-list';

interface CliOptions {
  db?: string;
  json?: boolean;
  pinned?: boolean;
  limit?: number;
  offset?: number;
}

function parseArgs(args: string[]): { command: CliCommand; positional: string[]; options: CliOptions } {
  const result: CliCommand[] = ['list', 'search', 'add', 'pin', 'unpin', 'delete', 'stats', 'clear', 'help', 'snippets', 'snippet-add', 'snippet-delete'];
  let command: CliCommand = 'help';
  const positional: string[] = [];
  const options: CliOptions = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--db' && i + 1 < args.length) {
      options.db = args[i + 1];
      i += 2;
      continue;
    } else if (arg === '--json') {
      options.json = true;
      i++;
    } else if (arg === '--pinned') {
      options.pinned = true;
      i++;
    } else if (arg === '--limit' && i + 1 < args.length) {
      options.limit = parseInt(args[i + 1], 10);
      i += 2;
      continue;
    } else if (arg === '--offset' && i + 1 < args.length) {
      options.offset = parseInt(args[i + 1], 10);
      i += 2;
      continue;
    } else if (result.includes(arg as CliCommand)) {
      command = arg as CliCommand;
      i++;
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { command, positional, options };
}

function output(data: any): void {
  if (typeof data === 'string') {
    process.stdout.write(data + '\n');
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
}

function error(msg: string): void {
  process.stderr.write('Error: ' + msg + '\n');
  process.exit(1);
}

function createManager(dbPath?: string): HistoryManager {
  const config: any = {};
  if (dbPath) {
    config.dbPath = dbPath;
  }
  return new HistoryManager(config);
}

function handleList(manager: HistoryManager, options: CliOptions): void {
  const clips = manager.getClips({
    pinned: options.pinned,
    limit: options.limit,
    offset: options.offset,
  });

  if (options.json) {
    output(clips);
    return;
  }

  if (clips.length === 0) {
    console.log('No clips found.');
    return;
  }

  console.log(`Found ${clips.length} clip(s):\n`);
  for (const clip of clips) {
    const time = manager.getRelativeTime(clip.createdAt);
    const pinLabel = clip.pinned ? '[PINNED] ' : '';
    const contentPreview = clip.content.length > 100 ? clip.content.substring(0, 100) + '...' : clip.content;
    console.log(`  ${pinLabel}${clip.id}  (${time})`);
    console.log(`    ${contentPreview}`);
    console.log('');
  }
}

function handleSearch(manager: HistoryManager, query: string, options: CliOptions): void {
  const clips = manager.searchClipsAdvanced({
    query,
    pinned: options.pinned,
    limit: options.limit,
    offset: options.offset,
  });

  if (options.json) {
    output(clips);
    return;
  }

  if (clips.length === 0) {
    console.log(`No clips found matching "${query}".`);
    return;
  }

  console.log(`Found ${clips.length} clip(s) matching "${query}":\n`);
  for (const clip of clips) {
    const time = manager.getRelativeTime(clip.createdAt);
    const pinLabel = clip.pinned ? '[PINNED] ' : '';
    const contentPreview = clip.content.length > 100 ? clip.content.substring(0, 100) + '...' : clip.content;
    console.log(`  ${pinLabel}${clip.id}  (${time})`);
    console.log(`    ${contentPreview}`);
    console.log('');
  }
}

function handleAdd(manager: HistoryManager, content: string, options: CliOptions): void {
  const clip = manager.addClip(content);

  if (!clip.id) {
    error('Failed to add clip (empty content or excluded by patterns).');
  }

  if (options.json) {
    output(clip);
    return;
  }

  console.log(`Clip added: ${clip.id}`);
  console.log(`  Content: ${clip.content}`);
  console.log(`  Pinned: ${clip.pinned}`);
  console.log(`  Hash: ${clip.hash}`);
}

function handlePin(manager: HistoryManager, clipId: string): void {
  const clip = manager.getClips().find((c) => c.id === clipId);
  if (!clip) {
    error(`Clip not found: ${clipId}`);
  }
  manager.pinClip(clipId);
  console.log(`Pinned: ${clipId}`);
}

function handleUnpin(manager: HistoryManager, clipId: string): void {
  const clip = manager.getClips().find((c) => c.id === clipId);
  if (!clip) {
    error(`Clip not found: ${clipId}`);
  }
  manager.unpinClip(clipId);
  console.log(`Unpinned: ${clipId}`);
}

function handleDelete(manager: HistoryManager, clipId: string): void {
  const deleted = manager.deleteClip(clipId);
  if (!deleted) {
    error(`Clip not found: ${clipId}`);
  }
  console.log(`Deleted: ${clipId}`);
}

function handleStats(manager: HistoryManager, options: CliOptions): void {
  const stats = manager.getStats();
  if (options.json) {
    output(stats);
    return;
  }
  console.log('Sentry-Clip Stats:');
  console.log(`  Total clips: ${stats.totalClips}`);
  console.log(`  Pinned clips: ${stats.pinnedClips}`);
  console.log(`  Total snippets: ${stats.totalSnippets}`);
  console.log(`  Total mask rules: ${stats.totalMaskRules}`);
}

function handleClear(manager: HistoryManager): void {
  const count = manager.clearHistory();
  console.log(`Cleared ${count} clip(s).`);
}

function handleSnippets(manager: HistoryManager, options: CliOptions): void {
  const snippets = manager.getAllSnippets();

  if (options.json) {
    output(snippets);
    return;
  }

  if (snippets.length === 0) {
    console.log('No snippets found.');
    return;
  }

  console.log(`Found ${snippets.length} snippet(s):\n`);
  for (const snippet of snippets) {
    console.log(`  ${snippet.id}  (${snippet.name})`);
    console.log(`    ${snippet.content}`);
    if (snippet.placeholders.length > 0) {
      console.log(`    Placeholders: ${snippet.placeholders.join(', ')}`);
    }
    console.log('');
  }
}

function handleSnippetAdd(manager: HistoryManager, args: string[], json: boolean): void {
  if (args.length < 2) {
    error('Usage: sentry-clip snippet-add <name> <content>');
  }
  const name = args[0];
  const content = args.slice(1).join(' ');
  const snippetEngine = new SnippetEngine();
  const snippet: Snippet = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name,
    content,
    placeholders: snippetEngine.extractPlaceholders(content),
    createdAt: Date.now(),
  };
  manager.addSnippet(snippet);
  console.log(`Snippet added: ${snippet.id} (${snippet.name})`);
  if (json) {
    output(snippet);
  }
}

function handleSnippetDelete(manager: HistoryManager, snippetId: string): void {
  const before = manager.getSnippet(snippetId);
  if (!before) {
    error(`Snippet not found: ${snippetId}`);
  }
  manager.deleteSnippet(snippetId);
  console.log(`Deleted snippet: ${snippetId}`);
}

function handleHelp(): void {
  console.log(`
Sentry-Clip CLI - Secure clipboard manager

Usage:
  npx sentry-clip <command> [options]

Commands:
  list              List all clips (or pinned with --pinned)
  search <query>    Search clips by content
  add <content>     Add a new clip
  pin <id>          Pin a clip by ID
  unpin <id>        Unpin a clip by ID
  delete <id>       Delete a clip by ID
  stats             Show clip/snippet/mask stats
  clear             Clear all clips
  snippets          List all snippets
  snippet-add <name> <content>  Add a snippet
  snippet-delete <id>          Delete a snippet
  help              Show this help message

Options:
  --db <path>       SQLite database path (default: in-memory)
  --json            Output results as JSON
  --pinned          Filter to pinned clips only
  --limit <N>       Limit number of results
  --offset <N>      Offset for pagination

Examples:
  npx sentry-clip list
  npx sentry-clip search "password" --json
  npx sentry-clip add "hello world"
  npx sentry-clip pin abc123
  npx sentry-clip stats --json
  npx sentry-clip list --pinned --limit 10
`);
}

// Main entry point
const { command, positional, options } = parseArgs(process.argv.slice(2));

let manager: HistoryManager | null = null;

try {
  switch (command) {
    case 'list':
      manager = createManager(options.db);
      handleList(manager, options);
      break;
    case 'search':
      if (positional.length === 0) {
        error('Usage: sentry-clip search <query>');
      }
      manager = createManager(options.db);
      handleSearch(manager, positional[0], options);
      break;
    case 'add':
      if (positional.length === 0) {
        error('Usage: sentry-clip add <content>');
      }
      manager = createManager(options.db);
      handleAdd(manager, positional.join(' '), options);
      break;
    case 'pin':
      if (positional.length === 0) {
        error('Usage: sentry-clip pin <id>');
      }
      manager = createManager(options.db);
      handlePin(manager, positional[0]);
      break;
    case 'unpin':
      if (positional.length === 0) {
        error('Usage: sentry-clip unpin <id>');
      }
      manager = createManager(options.db);
      handleUnpin(manager, positional[0]);
      break;
    case 'delete':
      if (positional.length === 0) {
        error('Usage: sentry-clip delete <id>');
      }
      manager = createManager(options.db);
      handleDelete(manager, positional[0]);
      break;
    case 'stats':
      manager = createManager(options.db);
      handleStats(manager, options);
      break;
    case 'clear':
      manager = createManager(options.db);
      handleClear(manager);
      break;
    case 'snippets':
      manager = createManager(options.db);
      handleSnippets(manager, options);
      break;
    case 'snippet-add':
      manager = createManager(options.db);
      handleSnippetAdd(manager, positional, options.json || false);
      break;
    case 'snippet-delete':
      if (positional.length === 0) {
        error('Usage: sentry-clip snippet-delete <id>');
      }
      manager = createManager(options.db);
      handleSnippetDelete(manager, positional[0]);
      break;
    case 'help':
    default:
      handleHelp();
      break;
  }
} finally {
  if (manager) {
    manager.close();
  }
}
