import { Clip, ClipHistoryConfig } from './models';
import { ClipStorage } from './storage';
import { MaskEngine } from './masking';

/**
 * Convert a glob pattern to a RegExp.
 * Supports: *, **, ?, [...]
 * If the pattern has no glob characters, treat it as a substring match.
 */
function globToRegex(pattern: string): RegExp {
  const hasGlobChars = /\*|\?|\[/.test(pattern);

  if (!hasGlobChars) {
    // No glob characters: treat as substring match (case-insensitive)
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }

  // Escape all regex special chars except * and ?
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Replace ** with a placeholder that won't conflict
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    // Replace single * with [^/]* (match anything except /)
    .replace(/\*/g, '[^/]*')
    // Restore ** as .* (match anything including /)
    .replace(/___DOUBLE_STAR___/g, '.*')
    // Replace ? with single char match
    .replace(/\?/g, '.');

  return new RegExp(`^${regexStr}$`, 'i');
}

/**
 * Check if content matches any exclusion glob pattern.
 */
function matchesExclusion(content: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Try glob matching first
    try {
      const regex = globToRegex(pattern);
      if (regex.test(content)) {
        return true;
      }
    } catch {
      // If glob parsing fails, fall back to literal substring match
      if (content.toLowerCase().includes(pattern.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if content is a duplicate of any existing clip (by hash).
 */
function isDuplicate(content: string, hash: string, storage: ClipStorage): boolean {
  const existing = storage.getAllClips();
  return existing.some((c) => c.hash === hash);
}

export class HistoryManager {
  private storage: ClipStorage;
  private maskEngine: MaskEngine;
  private config: ClipHistoryConfig;

  constructor(config?: Partial<ClipHistoryConfig>) {
    this.config = {
      maxHistory: 1000,
      enableMasking: true,
      enableSnippets: true,
      exclusionPatterns: [],
      ...config,
    };
    this.storage = new ClipStorage();
    this.maskEngine = new MaskEngine();
  }

  setMaskEngine(maskEngine: MaskEngine): void {
    this.maskEngine = maskEngine;
  }

  setConfig(config: Partial<ClipHistoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ClipHistoryConfig {
    return { ...this.config };
  }

  /**
   * Add a clip to history.
   * - Skips if content matches exclusion patterns (glob or regex)
   * - Optionally masks sensitive data
   * - Enforces max history limits (pinned clips are preserved)
   * - Returns empty clip if excluded, otherwise the new clip
   */
  addClip(content: string): Clip {
    // Skip empty content
    if (!content || content.trim() === '') {
      return { id: '', content: '', createdAt: 0, pinned: false, hash: '' };
    }

    // Check exclusion patterns (glob patterns)
    if (matchesExclusion(content, this.config.exclusionPatterns)) {
      return { id: '', content: '', createdAt: 0, pinned: false, hash: '' };
    }

    // Mask content if enabled
    const maskedContent = this.config.enableMasking ? this.maskEngine.mask(content) : content;
    const hash = this.maskEngine.getMaskedHash(maskedContent);

    const clip: Clip = {
      id: this.generateId(),
      content: maskedContent,
      createdAt: Date.now(),
      pinned: false,
      hash,
    };

    this.storage.saveClip(clip);
    this.enforceLimits();
    return clip;
  }

  /**
   * Get clips with optional filtering.
   */
  getClips(options?: { pinned?: boolean; limit?: number; offset?: number }): Clip[] {
    return this.storage.getAllClips(options);
  }

  /**
   * Search clips by query string (full-text search).
   */
  searchClips(query: string): Clip[] {
    return this.storage.searchClips(query);
  }

  /**
   * Search clips with advanced options (query + pinned filter + pagination).
   */
  searchClipsAdvanced(options: {
    query?: string;
    pinned?: boolean;
    limit?: number;
    offset?: number;
  }): Clip[] {
    return this.storage.searchClipsAdvanced({
      query: options.query || '',
      pinned: options.pinned,
      limit: options.limit,
      offset: options.offset,
    });
  }

  /**
   * Pin a clip by ID.
   */
  pinClip(clipId: string): void {
    this.storage.pinClip(clipId);
  }

  /**
   * Unpin a clip by ID.
   */
  unpinClip(clipId: string): void {
    this.storage.unpinClip(clipId);
  }

  /**
   * Toggle pin state of a clip.
   */
  togglePin(clipId: string): void {
    const clip = this.storage.getClip(clipId);
    if (clip) {
      if (clip.pinned) {
        this.unpinClip(clipId);
      } else {
        this.pinClip(clipId);
      }
    }
  }

  /**
   * Delete a clip by ID.
   */
  deleteClip(clipId: string): boolean {
    return this.storage.deleteClip(clipId);
  }

  /**
   * Get pin info for a clip.
   */
  getPin(clipId: string) {
    return this.storage.getPin(clipId);
  }

  /**
   * Get all pinned clips.
   */
  getPinnedClips(): Clip[] {
    return this.storage.getPinnedClips();
  }

  /**
   * Get relative time string from timestamp.
   */
  getRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  /**
   * Get total clip count.
   */
  getClipCount(): number {
    return this.storage.getClipCount();
  }

  /**
   * Get pinned clip count.
   */
  getPinnedCount(): number {
    return this.storage.getPinCount();
  }

  /**
   * Get overall stats.
   */
  getStats() {
    return this.storage.getStats();
  }

  /**
   * Clear all clips (resets history).
   */
  clearHistory(): number {
    return this.storage.truncateClips();
  }

  /**
   * Update exclusion patterns.
   */
  setExclusionPatterns(patterns: string[]): void {
    this.config.exclusionPatterns = patterns;
  }

  /**
   * Check if content would be excluded by current patterns.
   */
  isExcluded(content: string): boolean {
    return matchesExclusion(content, this.config.exclusionPatterns);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Enforce max history limits:
   * - Pinned clips are always preserved
   * - Unpinned clips are trimmed to maxHistory
   */
  private enforceLimits(): void {
    const clips = this.storage.getAllClips();
    const pinnedClips = clips.filter((c) => c.pinned);
    const unpinnedClips = clips.filter((c) => !c.pinned);

    if (unpinnedClips.length > this.config.maxHistory) {
      const toDelete = unpinnedClips.slice(this.config.maxHistory);
      for (const clip of toDelete) {
        this.storage.deleteClip(clip.id);
      }
    }
  }

  close(): void {
    this.storage.close();
  }
}
