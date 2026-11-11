import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HistoryManager } from '../src/history';
import { MaskEngine } from '../src/masking';
import * as fs from 'fs';
import * as path from 'path';

describe('HistoryManager', () => {
  let manager: HistoryManager;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(__dirname, `test-history-${Date.now()}.db`);
    manager = new HistoryManager({
      maxHistory: 1000,
      enableMasking: true,
      enableSnippets: true,
      exclusionPatterns: [],
    });
  });

  afterEach(() => {
    manager.close();
    // Clean up test database
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore if file doesn't exist
    }
  });

  describe('addClip', () => {
    it('should add a clip with valid content', () => {
      const clip = manager.addClip('Hello, world!');

      expect(clip).toBeDefined();
      expect(clip.content).toBe('Hello, world!');
      expect(clip.pinned).toBe(false);
      expect(clip.hash).toBeDefined();
      expect(clip.id).toBeDefined();
      expect(clip.createdAt).toBeGreaterThan(0);
    });

    it('should return empty clip for empty content', () => {
      const clip = manager.addClip('');

      expect(clip.content).toBe('');
      expect(clip.id).toBe('');
      expect(clip.createdAt).toBe(0);
    });

    it('should return empty clip for whitespace-only content', () => {
      const clip = manager.addClip('   ');

      expect(clip.content).toBe('');
      expect(clip.id).toBe('');
    });

    it('should mask content when masking is enabled', () => {
      const maskEngine = new MaskEngine();
      maskEngine.addRule({
        id: 'email',
        name: 'Email Mask',
        pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
        replacement: '[EMAIL]',
        enabled: true,
      });
      manager.setMaskEngine(maskEngine);

      const clip = manager.addClip('Contact me at test@example.com');

      expect(clip.content).toBe('Contact me at [EMAIL]');
    });

    it('should not mask content when masking is disabled', () => {
      manager = new HistoryManager({
        maxHistory: 1000,
        enableMasking: false,
        enableSnippets: true,
        exclusionPatterns: [],
      });

      const clip = manager.addClip('Contact me at test@example.com');

      expect(clip.content).toBe('Contact me at test@example.com');
    });

    it('should skip clips matching exclusion patterns (literal)', () => {
      manager = new HistoryManager({
        maxHistory: 1000,
        enableMasking: false,
        enableSnippets: true,
        exclusionPatterns: ['password', 'secret'],
      });

      const clip1 = manager.addClip('Normal content');
      const clip2 = manager.addClip('This contains password123');

      expect(clip1.content).toBe('Normal content');
      expect(clip2.content).toBe('');
    });

    it('should skip clips matching exclusion patterns (case-insensitive)', () => {
      manager = new HistoryManager({
        maxHistory: 1000,
        enableMasking: false,
        enableSnippets: true,
        exclusionPatterns: ['PASSWORD'],
      });

      const clip1 = manager.addClip('Normal content');
      const clip2 = manager.addClip('This contains password123');

      expect(clip1.content).toBe('Normal content');
      expect(clip2.content).toBe('');
    });

    it('should skip clips matching exclusion patterns (glob pattern)', () => {
      manager = new HistoryManager({
        maxHistory: 1000,
        enableMasking: false,
        enableSnippets: true,
        exclusionPatterns: ['*.log'],
      });

      const clip1 = manager.addClip('Normal content');
      const clip2 = manager.addClip('error.log');

      expect(clip1.content).toBe('Normal content');
      expect(clip2.content).toBe('');
    });

    it('should skip clips matching exclusion patterns (double-star glob)', () => {
      manager = new HistoryManager({
        maxHistory: 1000,
        enableMasking: false,
        enableSnippets: true,
        exclusionPatterns: ['**/temp/**'],
      });

      const clip1 = manager.addClip('Normal content');
      const clip2 = manager.addClip('path/to/temp/file.txt');

      expect(clip1.content).toBe('Normal content');
      expect(clip2.content).toBe('');
    });

    it('should skip clips matching exclusion patterns (question mark glob)', () => {
      manager = new HistoryManager({
        maxHistory: 1000,
        enableMasking: false,
        enableSnippets: true,
        exclusionPatterns: ['file?.txt'],
      });

      const clip1 = manager.addClip('Normal content');
      const clip2 = manager.addClip('file1.txt');
      const clip3 = manager.addClip('fileA.txt');

      expect(clip1.content).toBe('Normal content');
      expect(clip2.content).toBe('');
      expect(clip3.content).toBe('');
    });

    it('should skip clips matching exclusion patterns (multiple patterns)', () => {
      manager = new HistoryManager({
        maxHistory: 1000,
        enableMasking: false,
        enableSnippets: true,
        exclusionPatterns: ['password', '*.log', '**/temp/**'],
      });

      const clip1 = manager.addClip('Normal content');
      const clip2 = manager.addClip('This has password');
      const clip3 = manager.addClip('error.log');
      const clip4 = manager.addClip('path/to/temp/file.txt');

      expect(clip1.content).toBe('Normal content');
      expect(clip2.content).toBe('');
      expect(clip3.content).toBe('');
      expect(clip4.content).toBe('');
    });

    it('should not skip clips that don\'t match exclusion patterns', () => {
      manager = new HistoryManager({
        maxHistory: 1000,
        enableMasking: false,
        enableSnippets: true,
        exclusionPatterns: ['password'],
      });

      const clip1 = manager.addClip('Normal content');
      const clip2 = manager.addClip('This has secret');

      expect(clip1.content).toBe('Normal content');
      expect(clip2.content).toBe('This has secret');
    });

    it('should generate unique IDs for each clip', () => {
      const clip1 = manager.addClip('Clip 1');
      const clip2 = manager.addClip('Clip 2');

      expect(clip1.id).not.toBe(clip2.id);
    });

    it('should generate timestamps in order', () => {
      const clip1 = manager.addClip('Clip 1');
      const clip2 = manager.addClip('Clip 2');

      expect(clip2.createdAt).toBeGreaterThanOrEqual(clip1.createdAt);
    });
  });

  describe('getClips', () => {
    it('should retrieve all clips', () => {
      manager.addClip('First clip');
      manager.addClip('Second clip');

      const clips = manager.getClips();
      expect(clips).toHaveLength(2);
    });

    it('should retrieve clips in reverse chronological order', () => {
      manager.addClip('First clip');
      manager.addClip('Second clip');

      const clips = manager.getClips();
      expect(clips[0].content).toBe('Second clip');
      expect(clips[1].content).toBe('First clip');
    });

    it('should filter by pinned status', () => {
      const clip1 = manager.addClip('Pinned clip');
      const clip2 = manager.addClip('Unpinned clip');
      manager.pinClip(clip1.id);

      const pinnedClips = manager.getClips({ pinned: true });
      const unpinnedClips = manager.getClips({ pinned: false });

      expect(pinnedClips).toHaveLength(1);
      expect(pinnedClips[0].id).toBe(clip1.id);
      expect(unpinnedClips).toHaveLength(1);
      expect(unpinnedClips[0].id).toBe(clip2.id);
    });

    it('should respect limit parameter', () => {
      manager.addClip('Clip 1');
      manager.addClip('Clip 2');
      manager.addClip('Clip 3');

      const clips = manager.getClips({ limit: 2 });
      expect(clips).toHaveLength(2);
    });

    it('should respect offset parameter', () => {
      manager.addClip('Clip 1');
      manager.addClip('Clip 2');
      manager.addClip('Clip 3');

      const clips = manager.getClips({ offset: 1, limit: 1 });
      expect(clips).toHaveLength(1);
      expect(clips[0].content).toBe('Clip 2');
    });
  });

  describe('searchClips', () => {
    it('should search clips by content', () => {
      manager.addClip('TypeScript is great');
      manager.addClip('JavaScript is also great');

      const results = manager.searchClips('TypeScript');
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('TypeScript is great');
    });

    it('should return all clips for empty query', () => {
      manager.addClip('Clip 1');
      manager.addClip('Clip 2');

      const results = manager.searchClips('');
      expect(results).toHaveLength(2);
    });

    it('should return all clips for whitespace query', () => {
      manager.addClip('Clip 1');
      manager.addClip('Clip 2');

      const results = manager.searchClips('   ');
      expect(results).toHaveLength(2);
    });

    it('should perform case-insensitive search', () => {
      manager.addClip('TypeScript is great');

      const results = manager.searchClips('typescript');
      expect(results).toHaveLength(1);
    });

    it('should return empty array for no matches', () => {
      manager.addClip('Clip 1');

      const results = manager.searchClips('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('searchClipsAdvanced', () => {
    it('should search with query and pinned filter', () => {
      const clip1 = manager.addClip('Pinned clip');
      const clip2 = manager.addClip('Unpinned clip');
      manager.pinClip(clip1.id);

      const results = manager.searchClipsAdvanced({
        query: 'clip',
        pinned: true,
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(clip1.id);
    });

    it('should search with pagination', () => {
      manager.addClip('Clip 1');
      manager.addClip('Clip 2');
      manager.addClip('Clip 3');

      const results = manager.searchClipsAdvanced({
        query: 'clip',
        limit: 2,
        offset: 1,
      });

      expect(results).toHaveLength(2);
    });

    it('should return all clips when query is empty', () => {
      manager.addClip('Clip 1');
      manager.addClip('Clip 2');

      const results = manager.searchClipsAdvanced({
        query: '',
      });

      expect(results).toHaveLength(2);
    });
  });

  describe('pinClip and unpinClip', () => {
    it('should pin a clip', () => {
      const clip = manager.addClip('Pin me');
      manager.pinClip(clip.id);

      const retrieved = manager.getClips();
      expect(retrieved[0].pinned).toBe(true);
    });

    it('should unpin a clip', () => {
      const clip = manager.addClip('Unpin me');
      manager.pinClip(clip.id);
      manager.unpinClip(clip.id);

      const afterUnpin = manager.getClips();
      expect(afterUnpin[0].pinned).toBe(false);
    });

    it('should toggle pin state', () => {
      const clip = manager.addClip('Toggle me');

      manager.togglePin(clip.id);
      expect(manager.getClips()[0].pinned).toBe(true);

      manager.togglePin(clip.id);
      expect(manager.getClips()[0].pinned).toBe(false);
    });

    it('should get pinned clips', () => {
      const clip1 = manager.addClip('Pinned clip');
      const clip2 = manager.addClip('Unpinned clip');
      manager.pinClip(clip1.id);

      const pinned = manager.getPinnedClips();
      expect(pinned).toHaveLength(1);
      expect(pinned[0].id).toBe(clip1.id);
    });

    it('should get pin info', () => {
      const clip = manager.addClip('Get pin info');
      manager.pinClip(clip.id);

      const pin = manager.getPin(clip.id);
      expect(pin).toBeDefined();
      expect(pin!.clipId).toBe(clip.id);
      expect(pin!.pinnedAt).toBeGreaterThan(0);
    });

    it('should return undefined for unpinned clip', () => {
      const clip = manager.addClip('Unpinned');

      const pin = manager.getPin(clip.id);
      expect(pin).toBeUndefined();
    });
  });

  describe('deleteClip', () => {
    it('should delete a clip', () => {
      const clip = manager.addClip('Delete me');
      const deleted = manager.deleteClip(clip.id);

      expect(deleted).toBe(true);
      expect(manager.getClips()).toHaveLength(0);
    });

    it('should return false for non-existent clip', () => {
      const deleted = manager.deleteClip('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('enforceLimits', () => {
    it('should enforce max history limits', () => {
      manager = new HistoryManager({
        maxHistory: 3,
        enableMasking: false,
        enableSnippets: true,
        exclusionPatterns: [],
      });

      manager.addClip('Clip 1');
      manager.addClip('Clip 2');
      manager.addClip('Clip 3');
      manager.addClip('Clip 4');

      const clips = manager.getClips();
      expect(clips.length).toBeLessThanOrEqual(3);
    });

    it('should not enforce limits on pinned clips', () => {
      manager = new HistoryManager({
        maxHistory: 2,
        enableMasking: false,
        enableSnippets: true,
        exclusionPatterns: [],
      });

      const clip1 = manager.addClip('Pinned clip');
      manager.pinClip(clip1.id);
      manager.addClip('Clip 2');
      manager.addClip('Clip 3');

      const clips = manager.getClips();
      // Pinned clip should survive
      const pinned = clips.find((c) => c.id === clip1.id);
      expect(pinned).toBeDefined();
    });

    it('should delete oldest unpinned clips when over limit', () => {
      manager = new HistoryManager({
        maxHistory: 2,
        enableMasking: false,
        enableSnippets: true,
        exclusionPatterns: [],
      });

      const clip1 = manager.addClip('Oldest clip');
      const clip2 = manager.addClip('Middle clip');
      const clip3 = manager.addClip('Newest clip');

      const clips = manager.getClips();
      expect(clips.length).toBe(2);
      // Should keep newest 2
      expect(clips[0].content).toBe('Newest clip');
      expect(clips[1].content).toBe('Middle clip');
    });
  });

  describe('getRelativeTime', () => {
    it('should generate relative timestamps', () => {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      const oneHourAgo = now - 3600000;
      const oneDayAgo = now - 86400000;

      expect(manager.getRelativeTime(now)).toMatch(/\ds ago/);
      expect(manager.getRelativeTime(oneMinuteAgo)).toMatch(/\dm ago/);
      expect(manager.getRelativeTime(oneHourAgo)).toMatch(/\dh ago/);
      expect(manager.getRelativeTime(oneDayAgo)).toMatch(/\dd ago/);
    });

    it('should handle zero time difference', () => {
      const now = Date.now();
      const result = manager.getRelativeTime(now);
      expect(result).toBe('0s ago');
    });
  });

  describe('getClipCount and getPinnedCount', () => {
    it('should return correct clip count', () => {
      manager.addClip('Clip 1');
      manager.addClip('Clip 2');

      expect(manager.getClipCount()).toBe(2);
    });

    it('should return correct pinned count', () => {
      const clip1 = manager.addClip('Pinned clip');
      const clip2 = manager.addClip('Unpinned clip');
      manager.pinClip(clip1.id);

      expect(manager.getPinnedCount()).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      const clip1 = manager.addClip('Clip 1');
      const clip2 = manager.addClip('Clip 2');
      manager.pinClip(clip1.id);

      const stats = manager.getStats();
      expect(stats.totalClips).toBe(2);
      expect(stats.pinnedClips).toBe(1);
      expect(stats.totalSnippets).toBe(0);
      expect(stats.totalMaskRules).toBe(0);
    });
  });

  describe('clearHistory', () => {
    it('should clear all clips', () => {
      manager.addClip('Clip 1');
      manager.addClip('Clip 2');

      const cleared = manager.clearHistory();
      expect(cleared).toBe(2);
      expect(manager.getClips()).toHaveLength(0);
    });
  });

  describe('setExclusionPatterns and isExcluded', () => {
    it('should update exclusion patterns', () => {
      manager.setExclusionPatterns(['secret']);

      const clip1 = manager.addClip('Normal content');
      const clip2 = manager.addClip('This has secret');

      expect(clip1.content).toBe('Normal content');
      expect(clip2.content).toBe('');
    });

    it('should check if content is excluded', () => {
      manager.setExclusionPatterns(['password']);

      expect(manager.isExcluded('Normal content')).toBe(false);
      expect(manager.isExcluded('This has password')).toBe(true);
    });

    it('should check glob patterns with isExcluded', () => {
      manager.setExclusionPatterns(['*.log']);

      expect(manager.isExcluded('Normal content')).toBe(false);
      expect(manager.isExcluded('error.log')).toBe(true);
      expect(manager.isExcluded('path/to/error.log')).toBe(false); // single * doesn't match /
    });

    it('should check double-star glob patterns with isExcluded', () => {
      manager.setExclusionPatterns(['**/temp/**']);

      expect(manager.isExcluded('Normal content')).toBe(false);
      expect(manager.isExcluded('path/to/temp/file.txt')).toBe(true);
    });
  });

  describe('setConfig', () => {
    it('should update config', () => {
      manager.setConfig({ maxHistory: 500 });

      expect(manager.getConfig().maxHistory).toBe(500);
    });

    it('should preserve existing config values', () => {
      manager.setConfig({ maxHistory: 500 });

      const config = manager.getConfig();
      expect(config.maxHistory).toBe(500);
      expect(config.enableMasking).toBe(true);
      expect(config.enableSnippets).toBe(true);
    });
  });

  describe('close', () => {
    it('should close the manager', () => {
      expect(() => manager.close()).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle very long content', () => {
      const longContent = 'a'.repeat(10000);
      const clip = manager.addClip(longContent);

      expect(clip.content).toBe(longContent);
      expect(clip.id).toBeDefined();
    });

    it('should handle special characters in content', () => {
      const specialContent = 'Special chars: @#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
      const clip = manager.addClip(specialContent);

      expect(clip.content).toBe(specialContent);
    });

    it('should handle unicode content', () => {
      const unicodeContent = '你好世界 🌍 مرحبا بالعالم';
      const clip = manager.addClip(unicodeContent);

      expect(clip.content).toBe(unicodeContent);
    });

    it('should handle newlines and tabs', () => {
      const multilineContent = 'Line 1\nLine 2\tTabbed';
      const clip = manager.addClip(multilineContent);

      expect(clip.content).toBe(multilineContent);
    });
  });
});
