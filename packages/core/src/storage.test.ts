import { describe, it, expect, beforeEach } from 'vitest';
import { Clip, Snippet, MaskRule } from '../src/models';
import { ClipStorage } from '../src/storage';

describe('ClipStorage', () => {
  let storage: ClipStorage;

  beforeEach(() => {
    storage = new ClipStorage(':memory:');
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
  });

  it('should return undefined for non-existent clip', () => {
    const result = storage.getClip('non-existent');
    expect(result).toBeUndefined();
  });

  it('should list all clips', () => {
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

  it('should search clips by content', () => {
    const clip1: Clip = {
      id: 'search-1',
      content: 'TypeScript is great',
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash1',
    };
    const clip2: Clip = {
      id: 'search-2',
      content: 'JavaScript is also great',
      createdAt: Date.now(),
      pinned: false,
      hash: 'hash2',
    };

    storage.saveClip(clip1);
    storage.saveClip(clip2);

    const results = storage.searchClips('TypeScript');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('search-1');
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

  it('should pin and unpin clips', () => {
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

    storage.unpinClip('pin-test-1');
    const unpinned = storage.getClip('pin-test-1');
    expect(unpinned?.pinned).toBe(false);
  });

  it('should handle snippets', () => {
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
    expect(retrieved?.placeholders).toEqual(['message']);
  });

  it('should handle mask rules', () => {
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
  });

  it('should close the database', () => {
    expect(() => storage.close()).not.toThrow();
  });
});
