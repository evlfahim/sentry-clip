import { describe, it, expect, beforeEach } from 'vitest';
import { Snippet } from '../src/models';
import { SnippetEngine } from '../src/snippets';

describe('SnippetEngine', () => {
  let engine: SnippetEngine;

  beforeEach(() => {
    engine = new SnippetEngine();
  });

  // ── CRUD ──────────────────────────────────────────────────────────

  it('should return empty array when no snippets exist', () => {
    expect(engine.getSnippets()).toHaveLength(0);
  });

  it('should add and retrieve a snippet', () => {
    const snippet: Snippet = {
      id: 'snippet-1',
      name: 'Console Log',
      content: 'console.log({{message}});',
      placeholders: ['message'],
      createdAt: Date.now(),
    };

    engine.addSnippet(snippet);
    const retrieved = engine.getSnippet('snippet-1');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Console Log');
    expect(retrieved?.content).toBe('console.log({{message}});');
  });

  it('should remove a snippet', () => {
    const snippet: Snippet = {
      id: 'snippet-1',
      name: 'Test',
      content: 'test',
      placeholders: [],
      createdAt: Date.now(),
    };

    engine.addSnippet(snippet);
    engine.removeSnippet('snippet-1');

    expect(engine.getSnippet('snippet-1')).toBeUndefined();
  });

  it('should set all snippets at once', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'New Snippet',
      content: 'content',
      placeholders: [],
      createdAt: Date.now(),
    };

    engine.setSnippets([snippet]);
    expect(engine.getSnippets()).toHaveLength(1);
    expect(engine.getSnippets()[0].name).toBe('New Snippet');
  });

  it('should remove a non-existent snippet without error', () => {
    expect(() => engine.removeSnippet('non-existent')).not.toThrow();
  });

  // ── Placeholder resolution ────────────────────────────────────────

  it('should resolve a single user-defined placeholder', () => {
    const snippet: Snippet = {
      id: 'snippet-1',
      name: 'Console Log',
      content: 'console.log({{message}});',
      placeholders: ['message'],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, { message: '"Hello"' });
    expect(result).toBe('console.log("Hello");');
  });

  it('should resolve multiple user-defined placeholders', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Multi Placeholder',
      content: '{{greeting}} {{name}}, {{date}}',
      placeholders: ['greeting', 'name', 'date'],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {
      greeting: 'Hello',
      name: 'World',
      date: '2024-01-01',
    });

    expect(result).toBe('Hello World, 2024-01-01');
  });

  it('should leave unresolved user-defined placeholders as-is', () => {
    const snippet: Snippet = {
      id: 'snippet-1',
      name: 'Template',
      content: 'Hello {{name}}!',
      placeholders: ['name'],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toBe('Hello {{name}}!');
  });

  it('should resolve built-in timestamp placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Timestamp',
      content: 'Created at {{timestamp}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    // timestamp should be a numeric string
    expect(result).toMatch(/^Created at \d+$/);
  });

  it('should resolve built-in date placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Date',
      content: 'Today is {{date}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toMatch(/^Today is \d{4}-\d{2}-\d{2}$/);
  });

  it('should resolve built-in time placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Time',
      content: 'Now: {{time}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toMatch(/^Now: \d{2}:\d{2}:\d{2}$/);
  });

  it('should resolve built-in datetime placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Datetime',
      content: 'ISO: {{datetime}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toMatch(/^ISO: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should resolve built-in hostname placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Hostname',
      content: 'Host: {{hostname}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toMatch(/^Host: .+$/);
  });

  it('should resolve built-in username placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Username',
      content: 'User: {{username}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toMatch(/^User: .+$/);
  });

  it('should resolve built-in uuid placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'UUID',
      content: 'ID: {{uuid}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(result).toMatch(
      /^ID: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('should resolve built-in random placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Random',
      content: 'Random: {{random}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toMatch(/^Random: [a-z0-9]{8}$/);
  });

  it('should resolve built-in now placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Now',
      content: 'Today: {{now}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toMatch(/^Today: \d{4}-\d{2}-\d{2}$/);
  });

  it('should resolve built-in epoch placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Epoch',
      content: 'Epoch: {{epoch}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toMatch(/^Epoch: \d+$/);
  });

  it('should resolve built-in selection placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Selection',
      content: 'Selected: {{selection}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toBe('Selected: {{selection}}');
  });

  it('should resolve built-in cursor placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Cursor',
      content: 'Cursor: {{cursor}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toBe('Cursor: {{cursor}}');
  });

  it('should resolve built-in clipboard placeholder', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Clipboard',
      content: 'Clip: {{clipboard}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toBe('Clip: {{clipboard}}');
  });

  it('should resolve mixed user-defined and built-in placeholders', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Mixed',
      content: '{{name}} at {{date}} ({{timestamp}})',
      placeholders: ['name'],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, { name: 'Alice' });
    expect(result).toMatch(/^Alice at \d{4}-\d{2}-\d{2} \(\d+\)$/);
  });

  it('should resolve the same placeholder multiple times', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Repeated',
      content: '{{name}} said {{name}}',
      placeholders: ['name'],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, { name: 'Bob' });
    expect(result).toBe('Bob said Bob');
  });

  it('should resolve multiple built-in placeholders in one string', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'All Builtin',
      content: '{{date}} {{time}} on {{hostname}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} on .+/);
  });

  it('should handle snippet with no placeholders', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Plain',
      content: 'Hello, world!',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toBe('Hello, world!');
  });

  it('should handle empty content', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Empty',
      content: '',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toBe('');
  });

  // ── Placeholder extraction ────────────────────────────────────────

  it('should extract placeholders from content', () => {
    const placeholders = engine.extractPlaceholders(
      'Hello {{name}}, today is {{date}}'
    );

    expect(placeholders).toContain('name');
    expect(placeholders).toContain('date');
    expect(placeholders).toHaveLength(2);
  });

  it('should not duplicate placeholders', () => {
    const placeholders = engine.extractPlaceholders(
      '{{name}} and {{name}} again'
    );

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toBe('name');
  });

  it('should extract built-in placeholder names', () => {
    const placeholders = engine.extractPlaceholders(
      'Created at {{timestamp}} by {{username}}'
    );

    expect(placeholders).toContain('timestamp');
    expect(placeholders).toContain('username');
    expect(placeholders).toHaveLength(2);
  });

  it('should return empty array when no placeholders exist', () => {
    const placeholders = engine.extractPlaceholders('Hello, world!');
    expect(placeholders).toHaveLength(0);
  });

  it('should extract mixed user and built-in placeholders', () => {
    const placeholders = engine.extractPlaceholders(
      '{{name}} on {{date}} at {{hostname}}'
    );

    expect(placeholders).toContain('name');
    expect(placeholders).toContain('date');
    expect(placeholders).toContain('hostname');
    expect(placeholders).toHaveLength(3);
  });

  // ── Built-in placeholder metadata ─────────────────────────────────

  it('should return built-in placeholder definitions', () => {
    const builtIn = engine.getBuiltInPlaceholders();

    expect(builtIn).toContainEqual({ name: 'timestamp', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'date', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'uuid', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'hostname', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'username', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'selection', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'cursor', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'clipboard', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'random', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'now', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'epoch', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'time', description: expect.any(String) });
    expect(builtIn).toContainEqual({ name: 'datetime', description: expect.any(String) });
  });

  it('should identify built-in placeholder names', () => {
    expect(engine.isBuiltInPlaceholder('timestamp')).toBe(true);
    expect(engine.isBuiltInPlaceholder('date')).toBe(true);
    expect(engine.isBuiltInPlaceholder('uuid')).toBe(true);
    expect(engine.isBuiltInPlaceholder('hostname')).toBe(true);
    expect(engine.isBuiltInPlaceholder('username')).toBe(true);
    expect(engine.isBuiltInPlaceholder('selection')).toBe(true);
    expect(engine.isBuiltInPlaceholder('cursor')).toBe(true);
    expect(engine.isBuiltInPlaceholder('clipboard')).toBe(true);
    expect(engine.isBuiltInPlaceholder('random')).toBe(true);
    expect(engine.isBuiltInPlaceholder('now')).toBe(true);
    expect(engine.isBuiltInPlaceholder('epoch')).toBe(true);
    expect(engine.isBuiltInPlaceholder('time')).toBe(true);
    expect(engine.isBuiltInPlaceholder('datetime')).toBe(true);
    expect(engine.isBuiltInPlaceholder('message')).toBe(false);
    expect(engine.isBuiltInPlaceholder('name')).toBe(false);
  });

  // ── Search ────────────────────────────────────────────────────────

  it('should search snippets by name', () => {
    const snippet1: Snippet = {
      id: 's1',
      name: 'Console Log',
      content: 'console.log();',
      placeholders: [],
      createdAt: Date.now(),
    };
    const snippet2: Snippet = {
      id: 's2',
      name: 'Fetch Request',
      content: 'fetch();',
      placeholders: [],
      createdAt: Date.now(),
    };

    engine.addSnippet(snippet1);
    engine.addSnippet(snippet2);

    const results = engine.searchSnippets('Console');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Console Log');
  });

  it('should search snippets by content', () => {
    const snippet1: Snippet = {
      id: 's1',
      name: 'Console Log',
      content: 'console.log();',
      placeholders: [],
      createdAt: Date.now(),
    };
    const snippet2: Snippet = {
      id: 's2',
      name: 'Alert Box',
      content: 'alert("hi");',
      placeholders: [],
      createdAt: Date.now(),
    };

    engine.addSnippet(snippet1);
    engine.addSnippet(snippet2);

    const results = engine.searchSnippets('alert');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Alert Box');
  });

  it('should return all snippets for empty query', () => {
    const snippet1: Snippet = {
      id: 's1',
      name: 'Snippet A',
      content: 'a',
      placeholders: [],
      createdAt: Date.now(),
    };
    const snippet2: Snippet = {
      id: 's2',
      name: 'Snippet B',
      content: 'b',
      placeholders: [],
      createdAt: Date.now(),
    };

    engine.addSnippet(snippet1);
    engine.addSnippet(snippet2);

    const results = engine.searchSnippets('');
    expect(results).toHaveLength(2);
  });

  it('should return empty array when no snippets match', () => {
    engine.addSnippet({
      id: 's1',
      name: 'Test',
      content: 'hello',
      placeholders: [],
      createdAt: Date.now(),
    });

    const results = engine.searchSnippets('zzz');
    expect(results).toHaveLength(0);
  });

  it('should be case-insensitive in search', () => {
    engine.addSnippet({
      id: 's1',
      name: 'Console Log',
      content: 'console.log();',
      placeholders: [],
      createdAt: Date.now(),
    });

    const results = engine.searchSnippets('console');
    expect(results).toHaveLength(1);
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('should handle special characters in user-defined placeholder values', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Special',
      content: 'Value: {{val}}',
      placeholders: ['val'],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {
      val: 'a{b}c$d&e(f)g',
    });
    expect(result).toBe('Value: a{b}c$d&e(f)g');
  });

  it('should handle placeholder names with underscores', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Underscore',
      content: '{{my_var}}',
      placeholders: ['my_var'],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, { my_var: 'hello' });
    expect(result).toBe('hello');
  });

  it('should generate unique UUIDs on each resolution', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'UUID',
      content: '{{uuid}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result1 = engine.resolvePlaceholders(snippet, {});
    const result2 = engine.resolvePlaceholders(snippet, {});

    // Strip the template prefix for comparison
    expect(result1).not.toBe(result2);
  });

  it('should generate unique random strings on each resolution', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Random',
      content: '{{random}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result1 = engine.resolvePlaceholders(snippet, {});
    const result2 = engine.resolvePlaceholders(snippet, {});

    expect(result1).not.toBe(result2);
  });

  it('should handle snippet with only built-in placeholders', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Built-in only',
      content: '{{date}} - {{hostname}}',
      placeholders: [],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {});
    expect(result).toMatch(/\d{4}-\d{2}-\d{2} - .+/);
  });

  it('should handle context with extra keys not in snippet placeholders', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Minimal',
      content: 'Hello {{name}}',
      placeholders: ['name'],
      createdAt: Date.now(),
    };

    const result = engine.resolvePlaceholders(snippet, {
      name: 'World',
      extra: 'ignored',
    });
    expect(result).toBe('Hello World');
  });
});
