import { Snippet } from './models';

/**
 * Built-in placeholder definitions with their value resolvers.
 * These are resolved at render time, not stored in the snippet.
 */
interface BuiltInPlaceholder {
  name: string;
  description: string;
  resolve: () => string;
}

const BUILTIN_PLACEHOLDERS: BuiltInPlaceholder[] = [
  {
    name: 'timestamp',
    description: 'Current Unix timestamp in milliseconds',
    resolve: () => Date.now().toString(),
  },
  {
    name: 'date',
    description: 'Current date in ISO format (YYYY-MM-DD)',
    resolve: () => new Date().toISOString().split('T')[0],
  },
  {
    name: 'time',
    description: 'Current time in HH:MM:SS format',
    resolve: () => new Date().toTimeString().split(' ')[0],
  },
  {
    name: 'datetime',
    description: 'Current date and time in ISO format',
    resolve: () => new Date().toISOString(),
  },
  {
    name: 'hostname',
    description: 'Current machine hostname',
    resolve: () => {
      try {
        return require('os').hostname();
      } catch {
        return 'localhost';
      }
    },
  },
  {
    name: 'username',
    description: 'Current OS user name',
    resolve: () => {
      try {
        return require('os').userInfo().username;
      } catch {
        return process.env.USER ?? process.env.USERNAME ?? 'user';
      }
    },
  },
  {
    name: 'selection',
    description: 'Currently selected text (placeholder — resolved by host)',
    resolve: () => '{{selection}}',
  },
  {
    name: 'cursor',
    description: 'Current cursor position (placeholder — resolved by host)',
    resolve: () => '{{cursor}}',
  },
  {
    name: 'clipboard',
    description: 'Current clipboard content (placeholder — resolved by host)',
    resolve: () => '{{clipboard}}',
  },
  {
    name: 'uuid',
    description: 'A random UUID v4 string',
    resolve: () => {
      // Simple UUID v4 generation without external deps
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    },
  },
  {
    name: 'random',
    description: 'A random 8-character alphanumeric string',
    resolve: () => Math.random().toString(36).substring(2, 10),
  },
  {
    name: 'now',
    description: 'Current date in YYYY-MM-DD format (alias for date)',
    resolve: () => new Date().toISOString().split('T')[0],
  },
  {
    name: 'epoch',
    description: 'Current Unix epoch seconds',
    resolve: () => Math.floor(Date.now() / 1000).toString(),
  },
];

/**
 * Snippet engine with placeholder resolution support.
 * Handles both user-defined placeholders (from snippet metadata) and
 * built-in dynamic placeholders (timestamp, date, hostname, etc.).
 */
export class SnippetEngine {
  private snippets: Snippet[];

  constructor(snippets: Snippet[] = []) {
    this.snippets = snippets;
  }

  addSnippet(snippet: Snippet): void {
    this.snippets.push(snippet);
  }

  removeSnippet(id: string): void {
    this.snippets = this.snippets.filter((s) => s.id !== id);
  }

  setSnippets(snippets: Snippet[]): void {
    this.snippets = snippets;
  }

  getSnippets(): Snippet[] {
    return this.snippets;
  }

  getSnippet(id: string): Snippet | undefined {
    return this.snippets.find((s) => s.id === id);
  }

  /**
   * Resolve all placeholders in a snippet's content.
   * - Built-in placeholders (e.g., {{timestamp}}, {{date}}) are resolved dynamically.
   * - User-defined placeholders are resolved from the provided context.
   * - Unresolved user-defined placeholders remain as-is ({{name}}).
   *
   * @param snippet - The snippet to resolve.
   * @param context - Key-value pairs for user-defined placeholders.
   * @returns The content with all placeholders resolved.
   */
  resolvePlaceholders(
    snippet: Snippet,
    context: Record<string, string> = {}
  ): string {
    let result = snippet.content;

    // First, resolve user-defined placeholders from context
    for (const placeholder of snippet.placeholders) {
      const regex = new RegExp(`\\{\\{${escapeRegex(placeholder)}\\}\\}`, 'g');
      const value = context[placeholder] ?? `{{${placeholder}}}`;
      result = result.replace(regex, value);
    }

    // Then, resolve built-in placeholders
    for (const builtin of BUILTIN_PLACEHOLDERS) {
      const regex = new RegExp(`\\{\\{${builtin.name}\\}\\}`, 'g');
      const value = builtin.resolve();
      result = result.replace(regex, value);
    }

    return result;
  }

  /**
   * Extract all placeholder names from content, including both user-defined
   * and built-in placeholders.
   *
   * @param content - The snippet content to scan.
   * @returns Array of unique placeholder names found.
   */
  extractPlaceholders(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const placeholders: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      if (!placeholders.includes(name)) {
        placeholders.push(name);
      }
    }
    return placeholders;
  }

  /**
   * Get a list of all available built-in placeholder definitions.
   */
  getBuiltInPlaceholders(): { name: string; description: string }[] {
    return BUILTIN_PLACEHOLDERS.map((p) => ({
      name: p.name,
      description: p.description,
    }));
  }

  /**
   * Check if a given placeholder name is a built-in placeholder.
   */
  isBuiltInPlaceholder(name: string): boolean {
    return BUILTIN_PLACEHOLDERS.some((p) => p.name === name);
  }

  /**
   * Search snippets by name or content.
   */
  searchSnippets(query: string): Snippet[] {
    const lowerQuery = query.toLowerCase();
    return this.snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.content.toLowerCase().includes(lowerQuery)
    );
  }
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
