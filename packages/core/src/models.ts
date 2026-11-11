/**
 * Core data models for the clipboard manager
 */

export interface Clip {
  id: string;
  content: string;
  createdAt: number;
  pinned: boolean;
  hash: string;
}

export interface Snippet {
  id: string;
  name: string;
  content: string;
  placeholders: string[];
  createdAt: number;
}

export interface MaskRule {
  id: string;
  name: string;
  pattern: RegExp;
  replacement: string;
  enabled: boolean;
}

export interface Pin {
  clipId: string;
  pinnedAt: number;
}

export interface ClipHistoryConfig {
  maxHistory: number;
  enableMasking: boolean;
  enableSnippets: boolean;
  exclusionPatterns: string[];
}
