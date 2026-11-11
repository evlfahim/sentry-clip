import { describe, it, expect, beforeEach } from 'vitest';
import { Snippet } from '../src/models';
import { SnippetEngine } from '../src/snippets';

describe('SnippetEngine', () => {
  let engine: SnippetEngine;

  beforeEach(() => {
    engine = new SnippetEngine();
  });

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

  it('should resolve placeholders in a snippet', () => {
    const snippet: Snippet = {
      id: 'snippet-1',
      name: 'Console Log',
      content: 'console.log({{message}});',
      placeholders: ['message'],
      createdAt: Date.now(),
    };

    engine.addSnippet(snippet);
    const result = engine.resolvePlaceholders(snippet, { message: '"Hello"' });

    expect(result).toBe('console.log("Hello");');
  });

  it('should use default value for missing placeholders', () => {
    const snippet: Snippet = {
      id: 'snippet-1',
      name: 'Template',
      content: 'Hello {{name}}!',
      placeholders: ['name'],
      createdAt: Date.now(),
    };

    engine.addSnippet(snippet);
    const result = engine.resolvePlaceholders(snippet, {});

    expect(result).toBe('Hello {{name}}!');
  });

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

  it('should handle multiple placeholders', () => {
    const snippet: Snippet = {
      id: 's1',
      name: 'Multi Placeholder',
      content: '{{greeting}} {{name}}, {{date}}',
      placeholders: ['greeting', 'name', 'date'],
      createdAt: Date.now(),
    };

    engine.addSnippet(snippet);
    const result = engine.resolvePlaceholders(snippet, {
      greeting: 'Hello',
      name: 'World',
      date: '2024-01-01',
    });

    expect(result).toBe('Hello World, 2024-01-01');
  });
});
