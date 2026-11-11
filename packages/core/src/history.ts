import { Clip, ClipHistoryConfig } from './models';
import { ClipStorage } from './storage';
import { MaskEngine } from './masking';

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

  addClip(content: string): Clip {
    // Check exclusion patterns
    for (const pattern of this.config.exclusionPatterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(content)) {
        return { id: '', content: '', createdAt: 0, pinned: false, hash: '' };
      }
    }

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

  getClips(options?: { pinned?: boolean; limit?: number; offset?: number }): Clip[] {
    return this.storage.getAllClips(options);
  }

  searchClips(query: string): Clip[] {
    return this.storage.searchClips(query);
  }

  pinClip(clipId: string): void {
    this.storage.pinClip(clipId);
  }

  unpinClip(clipId: string): void {
    this.storage.unpinClip(clipId);
  }

  deleteClip(clipId: string): boolean {
    return this.storage.deleteClip(clipId);
  }

  getPin(clipId: string) {
    return this.storage.getPin(clipId);
  }

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

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

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
