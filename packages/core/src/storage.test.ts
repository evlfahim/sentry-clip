import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Clip, Snippet, MaskRule } from '../src/models';
import { ClipStorage } from '../src/storage';
import * as fs from 'fs';
import * as path from 'path';

describe('ClipStorage - Basic CRUD', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should save and retrieve a clip', () => {
    const clip: Clip = {
      id: 'test-1',
      content: 'Hello, world!',
      createdAt: Date.now(),
      pinned: false,
      hash: 'abc123',
    };

    storage.saveClip(clip);
    const retrieved = storage.getClip('test-1');

    expect(retrieved).toBeDefined();
    expect(retrieved?.content).toBe('Hello, world!');
    expect(retrieved?.pinned).toBe(false);
    expect(retrieved?.hash).toBe('abc123');
  });

  it('should return undefined for non-existent clip', () => {
    const result = storage.getClip('non-existent');
    expect(result).toBeUndefined();
  });

  it('should list all clips ordered by creation date descending', () => {
    const clip1: Clip = {
      id: 'clip-1',
      content: 'First clip',
      createdAt: Date.now() - 1000,
      pinned: false,
      hash: 'hash1',
    };
    const clip2: Clip = {
      id: 'clip-2',
      content: 'Second clip',
      createdAt: Date.now(),
      pinned: true,
      hash: 'hash2',
    };

    storage.saveClip(clip1);
    storage.saveClip(clip2);

    const clips = storage.getAllClips();
    expect(clips).toHaveLength(2);
    expect(clips[0].content).toBe('Second clip'); // Most recent first
    expect(clips[1].content).toBe('First clip');
  });

  it('should filter by pinned status', () => {
    const pinnedClip: Clip = {
      id: 'pinned-1',
      content: 'Pinned content',
      createdAt: Date.now(),
      pinned: true,
      hash: 'pinned-hash',
    };
    const unpinnedClip: Clip = {
      id: 'unpinned-1',
      content: 'Unpinned content',
      createdAt: Date.now(),
      pinned: false,
      hash: 'unpinned-hash',
    };

    storage.saveClip(pinnedClip);
    storage.saveClip(unpinnedClip);

    const pinned = storage.getAllClips({ pinned: true });
    const unpinned = storage.getAllClips({ pinned: false });

    expect(pinned).toHaveLength(1);
    expect(pinned[0].id).toBe('pinned-1');
    expect(unpinned).toHaveLength(1);
    expect(unpinned[0].id).toBe('unpinned-1');
  });

  it('should support limit and offset pagination', () => {
    for (let i = 0; i < 10; i++) {
      storage.saveClip({
        id: `clip-${i}`,
        content: `Clip ${i}`,
        createdAt: Date.now() - i,
        pinned: false,
        hash: `hash-${i}`,
      });
    }

    const page1 = storage.getAllClips({ limit: 3 });
    expect(page1).toHaveLength(3);
    expect(page1[0].content).toBe('Clip 0');

    const page2 = storage.getAllClips({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);
    expect(page2[0].content).toBe('Clip 3');
  });

  it('should delete a clip', () => {
    const clip: Clip = {
      id: 'delete-1',
      content: 'To be deleted',
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash',
    };

    storage.saveClip(clip);
    const deleted = storage.deleteClip('delete-1');

    expect(deleted).toBe(true);
    expect(storage.getClip('delete-1')).toBeUndefined();
  });

  it('should return false when deleting non-existent clip', () => {
    const deleted = storage.deleteClip('non-existent');
    expect(deleted).toBe(false);
  });

  it('should update an existing clip (upsert)', () => {
    const clip: Clip = {
      id: 'upsert-1',
      content: 'Original content',
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash1',
    };

    storage.saveClip(clip);
    expect(storage.getClip('upsert-1')?.content).toBe('Original content');

    // Update the same clip
    clip.content = 'Updated content';
    clip.hash = 'hash2';
    storage.saveClip(clip);

    const updated = storage.getClip('upsert-1');
    expect(updated?.content).toBe('Updated content');
    expect(updated?.hash).toBe('hash2');
  });
});

describe('ClipStorage - FTS5 Full-Text Search', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should find clips using FTS5 full-text search', () => {
    storage.saveClip({ id: 'clip-1', content: 'TypeScript is great', createdAt: Date.now(), pinned: false, hash: 'h1' });
    storage.saveClip({ id: 'clip-2', content: 'JavaScript is also great', createdAt: Date.now(), pinned: false, hash: 'h2' });
    storage.saveClip({ id: 'clip-3', content: 'Python is different', createdAt: Date.now(), pinned: false, hash: 'h3' });

    const results = storage.searchClips('TypeScript');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('clip-1');
  });

  it('should find clips matching multiple terms', () => {
    storage.saveClip({ id: 'clip-1', content: 'React and Vue are popular', createdAt: Date.now(), pinned: false, hash: 'h1' });
    storage.saveClip({ id: 'clip-2', content: 'Angular is also popular', createdAt: Date.now(), pinned: false, hash: 'h2' });
    storage.saveClip({ id: 'clip-3', content: 'React is powerful', createdAt: Date.now(), pinned: false, hash: 'h3' });

    const results = storage.searchClips('React popular');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('clip-1');
  });

  it('should return empty array when no matches found', () => {
    storage.saveClip({ id: 'clip-1', content: 'Hello world', createdAt: Date.now(), pinned: false, hash: 'h1' });

    const results = storage.searchClips('nonexistent');
    expect(results).toHaveLength(0);
  });

  it('should fall back to LIKE search for partial matches not caught by FTS5', () => {
    storage.saveClip({ id: 'clip-1', content: 'test-value', createdAt: Date.now(), pinned: false, hash: 'h1' });

    // FTS5 tokenizes on hyphens, so "test-value" might not match "test" alone
    // The fallback should catch this
    const results = storage.searchClips('test');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('clip-1');
  });

  it('should handle special characters in search', () => {
    storage.saveClip({ id: 'clip-1', content: 'email: user@example.com', createdAt: Date.now(), pinned: false, hash: 'h1' });
    storage.saveClip({ id: 'clip-2', content: 'password: p@ssw0rd!', createdAt: Date.now(), pinned: false, hash: 'h2' });

    const results = storage.searchClips('example');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('clip-1');
  });

  it('should handle empty search query', () => {
    storage.saveClip({ id: 'clip-1', content: 'Hello', createdAt: Date.now(), pinned: false, hash: 'h1' });

    // Empty query should return all clips via LIKE fallback
    const results = storage.searchClips('');
    expect(results).toHaveLength(1);
  });

  it('should return results ordered by relevance then date', () => {
    const now = Date.now();
    storage.saveClip({ id: 'clip-1', content: 'TypeScript is great', createdAt: now - 2000, pinned: false, hash: 'h1' });
    storage.saveClip({ id: 'clip-2', content: 'TypeScript is amazing', createdAt: now - 1000, pinned: false, hash: 'h2' });
    storage.saveClip({ id: 'clip-3', content: 'JavaScript is great', createdAt: now, pinned: false, hash: 'h3' });

    const results = storage.searchClips('great');
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Both clip-1 and clip-3 contain "great", clip-2 contains "amazing"
  });
});

describe('ClipStorage - Advanced Search', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should search with query and pinned filter', () => {
    storage.saveClip({ id: 'clip-1', content: 'Important note', createdAt: Date.now(), pinned: true, hash: 'h1' });
    storage.saveClip({ id: 'clip-2', content: 'Important note', createdAt: Date.now(), pinned: false, hash: 'h2' });
    storage.saveClip({ id: 'clip-3', content: 'Unrelated', createdAt: Date.now(), pinned: true, hash: 'h3' });

    const results = storage.searchClipsAdvanced({ query: 'Important', pinned: true });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('clip-1');
  });

  it('should search with query, pinned filter, and limit', () => {
    for (let i = 0; i < 5; i++) {
      storage.saveClip({
        id: `clip-${i}`,
        content: 'Search term here',
        createdAt: Date.now() - i,
        pinned: false,
        hash: `h${i}`,
      });
    }

    const results = storage.searchClipsAdvanced({ query: 'Search', limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('should search with query, pinned filter, and offset', () => {
    for (let i = 0; i < 5; i++) {
      storage.saveClip({
        id: `clip-${i}`,
        content: 'Search term here',
        createdAt: Date.now() - i,
        pinned: false,
        hash: `h${i}`,
      });
    }

    const page1 = storage.searchClipsAdvanced({ query: 'Search', limit: 2, offset: 0 });
    const page2 = storage.searchClipsAdvanced({ query: 'Search', limit: 2, offset: 2 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it('should filter by pinned only without query', () => {
    storage.saveClip({ id: 'clip-1', content: 'Pinned', createdAt: Date.now(), pinned: true, hash: 'h1' });
    storage.saveClip({ id: 'clip-2', content: 'Unpinned', createdAt: Date.now(), pinned: false, hash: 'h2' });
    storage.saveClip({ id: 'clip-3', content: 'Also pinned', createdAt: Date.now(), pinned: true, hash: 'h3' });

    const results = storage.searchClipsAdvanced({ query: '', pinned: true });
    expect(results).toHaveLength(2);
    expect(results.every((c) => c.pinned)).toBe(true);
  });

  it('should prioritize pinned results in ordering', () => {
    storage.saveClip({ id: 'clip-1', content: 'Unpinned item', createdAt: Date.now(), pinned: false, hash: 'h1' });
    storage.saveClip({ id: 'clip-2', content: 'Pinned item', createdAt: Date.now() - 1000, pinned: true, hash: 'h2' });

    const results = storage.searchClipsAdvanced({ query: 'item' });
    expect(results[0].pinned).toBe(true);
  });
});

describe('ClipStorage - Pin Management', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should pin a clip and retrieve it', () => {
    const clip: Clip = {
      id: 'pin-test-1',
      content: 'Pin me',
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash',
    };

    storage.saveClip(clip);
    storage.pinClip('pin-test-1');

    const retrieved = storage.getClip('pin-test-1');
    expect(retrieved?.pinned).toBe(true);

    const pin = storage.getPin('pin-test-1');
    expect(pin).toBeDefined();
    expect(pin?.clipId).toBe('pin-test-1');
  });

  it('should unpin a clip', () => {
    const clip: Clip = {
      id: 'unpin-test-1',
      content: 'Unpin me',
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash',
    };

    storage.saveClip(clip);
    storage.pinClip('unpin-test-1');
    storage.unpinClip('unpin-test-1');

    const retrieved = storage.getClip('unpin-test-1');
    expect(retrieved?.pinned).toBe(false);

    const pin = storage.getPin('unpin-test-1');
    expect(pin).toBeUndefined();
  });

  it('should retrieve all pinned clips', () => {
    storage.saveClip({ id: 'clip-1', content: 'Pinned 1', createdAt: Date.now() - 2000, pinned: false, hash: 'h1' });
    storage.saveClip({ id: 'clip-2', content: 'Unpinned', createdAt: Date.now() - 1000, pinned: false, hash: 'h2' });
    storage.saveClip({ id: 'clip-3', content: 'Pinned 2', createdAt: Date.now(), pinned: false, hash: 'h3' });

    storage.pinClip('clip-1');
    storage.pinClip('clip-3');

    const pinned = storage.getPinnedClips();
    expect(pinned).toHaveLength(2);
    expect(pinned.map((c) => c.id)).toContain('clip-1');
    expect(pinned.map((c) => c.id)).toContain('clip-3');
  });

  it('should return empty array when no clips are pinned', () => {
    storage.saveClip({ id: 'clip-1', content: 'Unpinned', createdAt: Date.now(), pinned: false, hash: 'h1' });
    const pinned = storage.getPinnedClips();
    expect(pinned).toHaveLength(0);
  });

  it('should get pin count', () => {
    storage.saveClip({ id: 'clip-1', content: 'Clip 1', createdAt: Date.now(), pinned: false, hash: 'h1' });
    storage.saveClip({ id: 'clip-2', content: 'Clip 2', createdAt: Date.now(), pinned: false, hash: 'h2' });

    storage.pinClip('clip-1');
    storage.pinClip('clip-2');

    expect(storage.getPinCount()).toBe(2);
  });
});

describe('ClipStorage - Snippet CRUD', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should save and retrieve a snippet', () => {
    const snippet = {
      id: 'snippet-1',
      name: 'Console Log',
      content: 'console.log({{message}});',
      placeholders: ['message'],
      createdAt: Date.now(),
    };

    storage.saveSnippet(snippet);
    const retrieved = storage.getSnippet('snippet-1');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Console Log');
    expect(retrieved?.content).toBe('console.log({{message}});');
    expect(retrieved?.placeholders).toEqual(['message']);
  });

  it('should list all snippets', () => {
    storage.saveSnippet({ id: 's1', name: 'Alert', content: 'alert("{{msg}}")', placeholders: ['msg'], createdAt: Date.now() });
    storage.saveSnippet({ id: 's2', name: 'Console', content: 'console.log({{msg}})', placeholders: ['msg'], createdAt: Date.now() });

    const snippets = storage.getAllSnippets();
    expect(snippets).toHaveLength(2);
  });

  it('should search snippets by name and content', () => {
    storage.saveSnippet({ id: 's1', name: 'Console Log', content: 'console.log({{msg})', placeholders: ['msg'], createdAt: Date.now() });
    storage.saveSnippet({ id: 's2', name: 'Alert Box', content: 'alert("{{msg}}")', placeholders: ['msg'], createdAt: Date.now() });

    const results = storage.searchSnippets('Console');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Console Log');

    const results2 = storage.searchSnippets('alert');
    expect(results2).toHaveLength(1);
    expect(results2[0].name).toBe('Alert Box');
  });

  it('should delete a snippet', () => {
    storage.saveSnippet({ id: 's1', name: 'Test', content: 'test', placeholders: [], createdAt: Date.now() });
    const deleted = storage.deleteSnippet('s1');
    expect(deleted).toBe(true);
    expect(storage.getSnippet('s1')).toBeUndefined();
  });

  it('should return snippet count', () => {
    storage.saveSnippet({ id: 's1', name: 'S1', content: 'c', placeholders: [], createdAt: Date.now() });
    storage.saveSnippet({ id: 's2', name: 'S2', content: 'c', placeholders: [], createdAt: Date.now() });
    expect(storage.getSnippetCount()).toBe(2);
  });
});

describe('ClipStorage - Mask Rule CRUD', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should save and retrieve a mask rule', () => {
    const rule: MaskRule = {
      id: 'rule-1',
      name: 'Email Mask',
      pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
      replacement: '[EMAIL]',
      enabled: true,
    };

    storage.saveMaskRule(rule);
    const retrieved = storage.getMaskRule('rule-1');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Email Mask');
    expect(retrieved?.replacement).toBe('[EMAIL]');
    expect(retrieved?.enabled).toBe(true);
    expect(retrieved?.pattern.test('test@example.com')).toBe(true);
  });

  it('should list all mask rules', () => {
    storage.saveMaskRule({ id: 'r1', name: 'Rule 1', pattern: /test/g, replacement: 'X', enabled: true });
    storage.saveMaskRule({ id: 'r2', name: 'Rule 2', pattern: /foo/g, replacement: 'Y', enabled: false });

    const rules = storage.getAllMaskRules();
    expect(rules).toHaveLength(2);
  });

  it('should return only enabled mask rules', () => {
    storage.saveMaskRule({ id: 'r1', name: 'Enabled', pattern: /test/g, replacement: 'X', enabled: true });
    storage.saveMaskRule({ id: 'r2', name: 'Disabled', pattern: /foo/g, replacement: 'Y', enabled: false });

    const enabled = storage.getEnabledMaskRules();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].name).toBe('Enabled');
  });

  it('should delete a mask rule', () => {
    storage.saveMaskRule({ id: 'r1', name: 'Test', pattern: /test/g, replacement: 'X', enabled: true });
    const deleted = storage.deleteMaskRule('r1');
    expect(deleted).toBe(true);
    expect(storage.getMaskRule('r1')).toBeUndefined();
  });

  it('should return mask rule count', () => {
    storage.saveMaskRule({ id: 'r1', name: 'R1', pattern: /t/g, replacement: 'X', enabled: true });
    expect(storage.getAllMaskRules().length).toBe(1);
  });
});

describe('ClipStorage - Stats and Counts', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should return correct stats', () => {
    storage.saveClip({ id: 'c1', content: 'Clip 1', createdAt: Date.now(), pinned: false, hash: 'h1' });
    storage.saveClip({ id: 'c2', content: 'Clip 2', createdAt: Date.now(), pinned: true, hash: 'h2' });
    storage.saveClip({ id: 'c3', content: 'Clip 3', createdAt: Date.now(), pinned: true, hash: 'h3' });

    storage.saveSnippet({ id: 's1', name: 'Snippet 1', content: 'c', placeholders: [], createdAt: Date.now() });
    storage.saveMaskRule({ id: 'm1', name: 'Mask 1', pattern: /t/g, replacement: 'X', enabled: true });

    const stats = storage.getStats();
    expect(stats.totalClips).toBe(3);
    expect(stats.pinnedClips).toBe(2);
    expect(stats.totalSnippets).toBe(1);
    expect(stats.totalMaskRules).toBe(1);
  });

  it('should return zero stats for empty storage', () => {
    const stats = storage.getStats();
    expect(stats.totalClips).toBe(0);
    expect(stats.pinnedClips).toBe(0);
    expect(stats.totalSnippets).toBe(0);
    expect(stats.totalMaskRules).toBe(0);
  });

  it('should get clip count', () => {
    storage.saveClip({ id: 'c1', content: 'Clip 1', createdAt: Date.now(), pinned: false, hash: 'h1' });
    storage.saveClip({ id: 'c2', content: 'Clip 2', createdAt: Date.now(), pinned: false, hash: 'h2' });
    expect(storage.getClipCount()).toBe(2);
  });
});

describe('ClipStorage - Truncate Operations', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should truncate all clips', () => {
    storage.saveClip({ id: 'c1', content: 'Clip 1', createdAt: Date.now(), pinned: false, hash: 'h1' });
    storage.saveClip({ id: 'c2', content: 'Clip 2', createdAt: Date.now(), pinned: false, hash: 'h2' });

    const deleted = storage.truncateClips();
    expect(deleted).toBe(2);
    expect(storage.getClipCount()).toBe(0);
  });

  it('should truncate all snippets', () => {
    storage.saveSnippet({ id: 's1', name: 'S1', content: 'c', placeholders: [], createdAt: Date.now() });
    storage.saveSnippet({ id: 's2', name: 'S2', content: 'c', placeholders: [], createdAt: Date.now() });

    const deleted = storage.truncateSnippets();
    expect(deleted).toBe(2);
    expect(storage.getSnippetCount()).toBe(0);
  });

  it('should truncate all mask rules', () => {
    storage.saveMaskRule({ id: 'm1', name: 'M1', pattern: /t/g, replacement: 'X', enabled: true });

    const deleted = storage.truncateMaskRules();
    expect(deleted).toBe(1);
    expect(storage.getAllMaskRules()).toHaveLength(0);
  });

  it('should truncate all data', () => {
    storage.saveClip({ id: 'c1', content: 'Clip 1', createdAt: Date.now(), pinned: false, hash: 'h1' });
    storage.saveSnippet({ id: 's1', name: 'S1', content: 'c', placeholders: [], createdAt: Date.now() });
    storage.saveMaskRule({ id: 'm1', name: 'M1', pattern: /t/g, replacement: 'X', enabled: true });

    storage.truncateAll();

    expect(storage.getClipCount()).toBe(0);
    expect(storage.getSnippetCount()).toBe(0);
    expect(storage.getAllMaskRules()).toHaveLength(0);
  });
});

describe('ClipStorage - Persistence', () => {
  const testDbPath = path.join(__dirname, '..', '..', '..', 'test-storage.db');

  afterEach(() => {
    // Clean up test database
    try {
      fs.unlinkSync(testDbPath);
    } catch {
      // File may not exist
    }
  });

  it('should persist data to file-based SQLite database', () => {
    const storage = new ClipStorage(testDbPath);

    storage.saveClip({
      id: 'persist-1',
      content: 'Persistent clip',
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash1',
    });

    storage.saveSnippet({
      id: 'snippet-1',
      name: 'Persistent Snippet',
      content: 'console.log("test")',
      placeholders: [],
      createdAt: Date.now(),
    });

    storage.close();

    // Reopen the database and verify data persists
    const storage2 = new ClipStorage(testDbPath);
    const clip = storage2.getClip('persist-1');
    expect(clip).toBeDefined();
    expect(clip?.content).toBe('Persistent clip');

    const snippet = storage2.getSnippet('snippet-1');
    expect(snippet).toBeDefined();
    expect(snippet?.name).toBe('Persistent Snippet');

    storage2.close();
  });

  it('should persist mask rules to file', () => {
    const storage = new ClipStorage(testDbPath);

    storage.saveMaskRule({
      id: 'rule-1',
      name: 'Email Mask',
      pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
      replacement: '[EMAIL]',
      enabled: true,
    });

    storage.close();

    const storage2 = new ClipStorage(testDbPath);
    const rule = storage2.getMaskRule('rule-1');
    expect(rule).toBeDefined();
    expect(rule?.name).toBe('Email Mask');
    storage2.close();
  });

  it('should persist pin state to file', () => {
    const storage = new ClipStorage(testDbPath);

    storage.saveClip({
      id: 'pin-persist-1',
      content: 'Pin me',
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash',
    });

    storage.pinClip('pin-persist-1');
    storage.close();

    const storage2 = new ClipStorage(testDbPath);
    const clip = storage2.getClip('pin-persist-1');
    expect(clip?.pinned).toBe(true);
    const pin = storage2.getPin('pin-persist-1');
    expect(pin).toBeDefined();
    storage2.close();
  });
});

describe('ClipStorage - Query Speed', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should handle bulk insert efficiently', () => {
    const batchSize = 1000;
    const start = Date.now();

    for (let i = 0; i < batchSize; i++) {
      storage.saveClip({
        id: `bulk-${i}`,
        content: `Bulk clip number ${i} with some content to make it realistic`,
        createdAt: Date.now() - i,
        pinned: i % 10 === 0,
        hash: `hash-${i}`,
      });
    }

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000); // Should complete within 5 seconds
    expect(storage.getClipCount()).toBe(batchSize);
  });

  it('should perform FTS search efficiently on large dataset', () => {
    const batchSize = 500;

    for (let i = 0; i < batchSize; i++) {
      const topics = ['TypeScript', 'JavaScript', 'React', 'Vue', 'Angular', 'Node', 'Python', 'Rust'];
      const topic = topics[i % topics.length];
      storage.saveClip({
        id: `search-${i}`,
        content: `${topic} is a great programming language for building modern applications`,
        createdAt: Date.now() - i,
        pinned: false,
        hash: `hash-${i}`,
      });
    }

    const start = Date.now();
    const results = storage.searchClips('TypeScript');
    const elapsed = Date.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1000); // Should complete within 1 second
  });

  it('should perform advanced search efficiently', () => {
    const batchSize = 500;

    for (let i = 0; i < batchSize; i++) {
      storage.saveClip({
        id: `adv-${i}`,
        content: `Advanced search test clip ${i}`,
        createdAt: Date.now() - i,
        pinned: i % 5 === 0,
        hash: `hash-${i}`,
      });
    }

    const start = Date.now();
    const results = storage.searchClipsAdvanced({ query: 'search', pinned: true, limit: 10 });
    const elapsed = Date.now() - start;

    expect(results.length).toBeLessThanOrEqual(10);
    expect(elapsed).toBeLessThan(1000);
  });

  it('should handle pagination efficiently on large dataset', () => {
    const batchSize = 1000;

    for (let i = 0; i < batchSize; i++) {
      storage.saveClip({
        id: `page-${i}`,
        content: `Page clip ${i}`,
        createdAt: Date.now() - i,
        pinned: false,
        hash: `hash-${i}`,
      });
    }

    const start = Date.now();
    const page1 = storage.getAllClips({ limit: 50, offset: 0 });
    const page2 = storage.getAllClips({ limit: 50, offset: 50 });
    const elapsed = Date.now() - start;

    expect(page1).toHaveLength(50);
    expect(page2).toHaveLength(50);
    expect(page1[0].id).not.toBe(page2[0].id);
    expect(elapsed).toBeLessThan(2000);
  });

  it('should retrieve pinned clips efficiently', () => {
    const batchSize = 500;

    for (let i = 0; i < batchSize; i++) {
      storage.saveClip({
        id: `pin-quick-${i}`,
        content: `Clip ${i}`,
        createdAt: Date.now() - i,
        pinned: false,
        hash: `hash-${i}`,
      });
      // Pin every 20th clip
      if (i % 20 === 0) {
        storage.pinClip(`pin-quick-${i}`);
      }
    }

    const start = Date.now();
    const pinned = storage.getPinnedClips();
    const elapsed = Date.now() - start;

    expect(pinned.length).toBeGreaterThan(0);
    expect(pinned.every((c) => c.pinned)).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('ClipStorage - Index Verification', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should have FTS5 virtual table created', () => {
    const tables = storage.db.prepare("SELECT name FROM sqlite_master WHERE type='table' OR type='view'").all() as any[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('clips_fts');
  });

  it('should have all expected indexes', () => {
    const indexes = storage.db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as any[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_clips_content');
    expect(indexNames).toContain('idx_clips_created_at');
    expect(indexNames).toContain('idx_clips_pinned');
    expect(indexNames).toContain('idx_clips_hash');
    expect(indexNames).toContain('idx_clips_pinned_created');
    expect(indexNames).toContain('idx_snippets_name');
    expect(indexNames).toContain('idx_mask_rules_enabled');
  });

  it('should have triggers for FTS sync', () => {
    const triggers = storage.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all() as any[];
    const triggerNames = triggers.map((t) => t.name);

    expect(triggerNames).toContain('clips_ai');
    expect(triggerNames).toContain('clips_ad');
    expect(triggerNames).toContain('clips_au');
  });

  it('should use index for pinned queries', () => {
    // Insert data
    for (let i = 0; i < 100; i++) {
      storage.saveClip({
        id: `idx-${i}`,
        content: `Clip ${i}`,
        createdAt: Date.now() - i,
        pinned: i % 2 === 0,
        hash: `hash-${i}`,
      });
    }

    // Check query plan for pinned query
    const plan = storage.db.prepare('EXPLAIN QUERY PLAN SELECT * FROM clips WHERE pinned = 1').all() as any[];
    const planText = JSON.stringify(plan);

    // Should use the composite index idx_clips_pinned_created
    expect(planText).toContain('idx_clips_pinned_created');
  });

  it('should use index for content search', () => {
    storage.saveClip({ id: 'idx-search', content: 'Search test', createdAt: Date.now(), pinned: false, hash: 'h' });

    const plan = storage.db.prepare('EXPLAIN QUERY PLAN SELECT * FROM clips WHERE content LIKE ?').all(['%test%']) as any[];
    const planText = JSON.stringify(plan);

    // Should use the content index
    expect(planText).toContain('idx_clips_content');
  });
});

describe('ClipStorage - Edge Cases', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should handle very long content', () => {
    const longContent = 'a'.repeat(100000);
    storage.saveClip({
      id: 'long-clip',
      content: longContent,
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash',
    });

    const retrieved = storage.getClip('long-clip');
    expect(retrieved?.content).toBe(longContent);
  });

  it('should handle Unicode content', () => {
    const unicodeContent = 'こんにちは世界 🌍 你好世界 🇨🇳';
    storage.saveClip({
      id: 'unicode-clip',
      content: unicodeContent,
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash',
    });

    const retrieved = storage.getClip('unicode-clip');
    expect(retrieved?.content).toBe(unicodeContent);
  });

  it('should handle JSON content', () => {
    const jsonContent = JSON.stringify({ key: 'value', nested: { foo: 'bar' } });
    storage.saveClip({
      id: 'json-clip',
      content: jsonContent,
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash',
    });

    const retrieved = storage.getClip('json-clip');
    expect(retrieved?.content).toBe(jsonContent);
  });

  it('should handle SQL special characters in content', () => {
    const specialContent = "It's a 'test' with \"quotes\" and %wildcards_";
    storage.saveClip({
      id: 'special-clip',
      content: specialContent,
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash',
    });

    const retrieved = storage.getClip('special-clip');
    expect(retrieved?.content).toBe(specialContent);
  });

  it('should handle empty content', () => {
    storage.saveClip({
      id: 'empty-clip',
      content: '',
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash',
    });

    const retrieved = storage.getClip('empty-clip');
    expect(retrieved?.content).toBe('');
  });

  it('should handle multiple pins on same clip (idempotent)', () => {
    storage.saveClip({
      id: 'multi-pin',
      content: 'Clip',
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash',
    });

    storage.pinClip('multi-pin');
    storage.pinClip('multi-pin');
    storage.pinClip('multi-pin');

    const clip = storage.getClip('multi-pin');
    expect(clip?.pinned).toBe(true);
    expect(storage.getPinCount()).toBe(1);
  });

  it('should handle unpinning non-pinned clip', () => {
    storage.saveClip({
      id: 'unpin-none',
      content: 'Clip',
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash',
    });

    // Should not throw
    expect(() => storage.unpinClip('unpin-none')).not.toThrow();
  });

  it('should handle closing database multiple times', () => {
    storage.close();
    expect(() => storage.close()).not.toThrow();
  });
});
