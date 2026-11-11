import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryManager } from '../src/history';
import { MaskEngine } from '../src/masking';

describe('HistoryManager', () => {
  let manager: HistoryManager;

  beforeEach(() => {
    manager = new HistoryManager({
      maxHistory: 1000,
      enableMasking: true,
      enableSnippets: true,
      exclusionPatterns: [],
    });
  });

  it('should add a clip', () => {
    const clip = manager.addClip('Hello, world!');

    expect(clip).toBeDefined();
    expect(clip.content).toBe('Hello, world!');
    expect(clip.pinned).toBe(false);
    expect(clip.hash).toBeDefined();
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

  it('should skip clips matching exclusion patterns', () => {
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

  it('should retrieve all clips', () => {
    manager.addClip('First clip');
    manager.addClip('Second clip');

    const clips = manager.getClips();
    expect(clips).toHaveLength(2);
  });

  it('should search clips', () => {
    manager.addClip('TypeScript is great');
    manager.addClip('JavaScript is also great');

    const results = manager.searchClips('TypeScript');
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('TypeScript is great');
  });

  it('should pin and unpin clips', () => {
    const clip = manager.addClip('Pin me');
    manager.pinClip(clip.id);

    const retrieved = manager.getClips();
    expect(retrieved[0].pinned).toBe(true);

    manager.unpinClip(clip.id);
    const afterUnpin = manager.getClips();
    expect(afterUnpin[0].pinned).toBe(false);
  });

  it('should delete a clip', () => {
    const clip = manager.addClip('Delete me');
    const deleted = manager.deleteClip(clip.id);

    expect(deleted).toBe(true);
    expect(manager.getClips()).toHaveLength(0);
  });

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

  it('should close the manager', () => {
    expect(() => manager.close()).not.toThrow();
  });
});
