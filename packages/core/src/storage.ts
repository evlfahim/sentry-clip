import { Clip, Snippet, MaskRule, Pin, ClipHistoryConfig } from './models';

export interface SearchOptions {
  query: string;
  pinned?: boolean;
  limit?: number;
  offset?: number;
}

export interface ClipWithSnippet {
  clip: Clip;
  snippet?: Snippet;
}

export class ClipStorage {
  private db: any;
  private dbPath: string;
  private isPersistent: boolean;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
    this.isPersistent = dbPath !== ':memory:';
    this.db = this.initDB();
  }

  private initDB(): any {
    const Database = require('better-sqlite3');
    const db = new Database(this.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    db.pragma('temp_store = MEMORY');

    db.exec(`
      CREATE TABLE IF NOT EXISTS clips (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS snippets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        placeholders TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mask_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pattern TEXT NOT NULL,
        replacement TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS pins (
        clip_id TEXT PRIMARY KEY,
        pinned_at INTEGER NOT NULL,
        FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
      );

      -- Full-text search virtual table with explicit rowid mapping
      CREATE VIRTUAL TABLE IF NOT EXISTS clips_fts USING fts5(
        content,
        prefix='2 4 8'
      );

      -- Mapping table to link clip id (TEXT) to FTS rowid (INTEGER)
      CREATE TABLE IF NOT EXISTS clips_fts_mapping (
        clip_id TEXT PRIMARY KEY,
        fts_rowid INTEGER NOT NULL
      );

      -- Indexes for common query patterns
      CREATE INDEX IF NOT EXISTS idx_clips_content ON clips(content);
      CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at);
      CREATE INDEX IF NOT EXISTS idx_clips_pinned ON clips(pinned);
      CREATE INDEX IF NOT EXISTS idx_clips_hash ON clips(hash);
      CREATE INDEX IF NOT EXISTS idx_clips_pinned_created ON clips(pinned, created_at);
      CREATE INDEX IF NOT EXISTS idx_snippets_name ON snippets(name);
      CREATE INDEX IF NOT EXISTS idx_mask_rules_enabled ON mask_rules(enabled);
    `);

    return db;
  }

  /**
   * Manually sync FTS index after clip operations.
   * Uses a hash of the clip id as the FTS rowid (INTEGER).
   */
  private getFtsRowid(clipId: string): number {
    // Simple hash: sum of char codes mod 2^31
    let hash = 0;
    for (let i = 0; i < clipId.length; i++) {
      hash = ((hash << 5) - hash + clipId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  private syncFtsForClip(clipId: string, content: string, operation: 'insert' | 'update' | 'delete'): void {
    const rowid = this.getFtsRowid(clipId);
    if (operation === 'insert' || operation === 'update') {
      // Insert/update FTS entry (use OR REPLACE to handle hash collisions)
      this.db.prepare('INSERT OR REPLACE INTO clips_fts(rowid, content) VALUES (?, ?)').run(rowid, content);
      // Update mapping
      this.db.prepare('INSERT OR REPLACE INTO clips_fts_mapping(clip_id, fts_rowid) VALUES (?, ?)').run(clipId, rowid);
    } else if (operation === 'delete') {
      // Remove from FTS
      this.db.prepare('DELETE FROM clips_fts WHERE rowid = ?').run(rowid);
      // Remove mapping
      this.db.prepare('DELETE FROM clips_fts_mapping WHERE clip_id = ?').run(clipId);
    }
  }

  saveClip(clip: Clip): void {
    // Check if clip exists
    const existing = this.db.prepare('SELECT id, content FROM clips WHERE id = ?').get(clip.id);
    if (existing) {
      // Update existing
      this.db.prepare(
        'UPDATE clips SET content = ?, created_at = ?, pinned = ?, hash = ? WHERE id = ?'
      ).run(clip.content, clip.createdAt, clip.pinned ? 1 : 0, clip.hash, clip.id);
      // Sync FTS
      this.syncFtsForClip(clip.id, clip.content, 'update');
    } else {
      // Insert new
      this.db.prepare(
        'INSERT INTO clips (id, content, created_at, pinned, hash) VALUES (?, ?, ?, ?, ?)'
      ).run(clip.id, clip.content, clip.createdAt, clip.pinned ? 1 : 0, clip.hash);
      // Sync FTS
      this.syncFtsForClip(clip.id, clip.content, 'insert');
    }
  }

  getClip(id: string): Clip | undefined {
    const row = this.db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      content: row.content,
      createdAt: row.created_at,
      pinned: row.pinned === 1,
      hash: row.hash,
    };
  }

  getAllClips(options?: { pinned?: boolean; limit?: number; offset?: number }): Clip[] {
    let query = 'SELECT * FROM clips';
    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.pinned !== undefined) {
      conditions.push('pinned = ?');
      params.push(options.pinned ? 1 : 0);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      createdAt: row.created_at,
      pinned: row.pinned === 1,
      hash: row.hash,
    }));
  }

  searchClips(query: string): Clip[] {
    if (!query || query.trim() === '') {
      // Empty query returns all clips
      return this.getAllClips();
    }

    // Use FTS5 for full-text search, fall back to LIKE for partial matches
    // Join through the mapping table to connect clip id to FTS rowid
    const rows = this.db
      .prepare(
        'SELECT c.* FROM clips c INNER JOIN clips_fts_mapping m ON c.id = m.clip_id INNER JOIN clips_fts f ON m.fts_rowid = f.rowid WHERE clips_fts MATCH ? ORDER BY rank, c.created_at DESC'
      )
      .all(query) as any[];

    if (rows.length > 0) {
      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        createdAt: row.created_at,
        pinned: row.pinned === 1,
        hash: row.hash,
      }));
    }

    // Fallback: LIKE-based search for partial/substring matches
    return this.searchClipsLike(query);
  }

  searchClipsLike(query: string): Clip[] {
    const rows = this.db
      .prepare('SELECT * FROM clips WHERE content LIKE ? ORDER BY created_at DESC')
      .all(`%${query}%`) as any[];
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      createdAt: row.created_at,
      pinned: row.pinned === 1,
      hash: row.hash,
    }));
  }

  searchClipsAdvanced(options: SearchOptions): Clip[] {
    let query = 'SELECT c.* FROM clips c';
    const conditions: string[] = [];
    const params: any[] = [];

    // FTS5 search
    if (options.query && options.query.trim() !== '') {
      query += ' INNER JOIN clips_fts_mapping m ON c.id = m.clip_id INNER JOIN clips_fts f ON m.fts_rowid = f.rowid WHERE clips_fts MATCH ?';
      params.push(options.query);
      if (options.pinned !== undefined) {
        conditions.push('c.pinned = ?');
        params.push(options.pinned ? 1 : 0);
      }
    } else {
      query += ' WHERE 1=1';
      if (options.pinned !== undefined) {
        conditions.push('c.pinned = ?');
        params.push(options.pinned ? 1 : 0);
      }
    }

    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    query += ' ORDER BY c.pinned DESC, c.created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      createdAt: row.created_at,
      pinned: row.pinned === 1,
      hash: row.hash,
    }));
  }

  deleteClip(id: string): boolean {
    // Get content before deleting for FTS sync
    const existing = this.db.prepare('SELECT content FROM clips WHERE id = ?').get(id);
    if (existing) {
      this.syncFtsForClip(id, existing.content, 'delete');
    }
    const result = this.db.prepare('DELETE FROM clips WHERE id = ?').run(id);
    return result.changes > 0;
  }

  pinClip(clipId: string): void {
    this.db.prepare('UPDATE clips SET pinned = 1 WHERE id = ?').run(clipId);
    this.db
      .prepare('INSERT OR REPLACE INTO pins (clip_id, pinned_at) VALUES (?, ?)')
      .run(clipId, Date.now());
  }

  unpinClip(clipId: string): void {
    this.db.prepare('UPDATE clips SET pinned = 0 WHERE id = ?').run(clipId);
    this.db.prepare('DELETE FROM pins WHERE clip_id = ?').run(clipId);
  }

  getPin(clipId: string): Pin | undefined {
    const row = this.db.prepare('SELECT * FROM pins WHERE clip_id = ?').get(clipId) as any;
    if (!row) return undefined;
    return { clipId: row.clip_id, pinnedAt: row.pinned_at };
  }

  getPinnedClips(): Clip[] {
    const rows = this.db
      .prepare(
        'SELECT c.* FROM clips c INNER JOIN pins p ON c.id = p.clip_id ORDER BY p.pinned_at DESC'
      )
      .all() as any[];
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      createdAt: row.created_at,
      pinned: row.pinned === 1,
      hash: row.hash,
    }));
  }

  saveSnippet(snippet: Snippet): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO snippets (id, name, content, placeholders, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(
      snippet.id,
      snippet.name,
      snippet.content,
      JSON.stringify(snippet.placeholders),
      snippet.createdAt
    );
  }

  getSnippet(id: string): Snippet | undefined {
    const row = this.db.prepare('SELECT * FROM snippets WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      placeholders: JSON.parse(row.placeholders),
      createdAt: row.created_at,
    };
  }

  getAllSnippets(): Snippet[] {
    const rows = this.db.prepare('SELECT * FROM snippets ORDER BY name').all() as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      content: row.content,
      placeholders: JSON.parse(row.placeholders),
      createdAt: row.created_at,
    }));
  }

  searchSnippets(query: string): Snippet[] {
    const rows = this.db
      .prepare('SELECT * FROM snippets WHERE name LIKE ? OR content LIKE ? ORDER BY name')
      .all(`%${query}%`, `%${query}%`) as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      content: row.content,
      placeholders: JSON.parse(row.placeholders),
      createdAt: row.created_at,
    }));
  }

  deleteSnippet(id: string): boolean {
    const result = this.db.prepare('DELETE FROM snippets WHERE id = ?').run(id);
    return result.changes > 0;
  }

  saveMaskRule(rule: MaskRule): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO mask_rules (id, name, pattern, replacement, enabled) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(rule.id, rule.name, rule.pattern.source, rule.replacement, rule.enabled ? 1 : 0);
  }

  getMaskRule(id: string): MaskRule | undefined {
    const row = this.db.prepare('SELECT * FROM mask_rules WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      pattern: new RegExp(row.pattern),
      replacement: row.replacement,
      enabled: row.enabled === 1,
    };
  }

  getAllMaskRules(): MaskRule[] {
    const rows = this.db.prepare('SELECT * FROM mask_rules').all() as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      pattern: new RegExp(row.pattern),
      replacement: row.replacement,
      enabled: row.enabled === 1,
    }));
  }

  getEnabledMaskRules(): MaskRule[] {
    const rows = this.db
      .prepare('SELECT * FROM mask_rules WHERE enabled = 1')
      .all() as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      pattern: new RegExp(row.pattern),
      replacement: row.replacement,
      enabled: row.enabled === 1,
    }));
  }

  deleteMaskRule(id: string): boolean {
    const result = this.db.prepare('DELETE FROM mask_rules WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getClipCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM clips').get() as any;
    return row.count;
  }

  getSnippetCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM snippets').get() as any;
    return row.count;
  }

  getPinCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM pins').get() as any;
    return row.count;
  }

  getStats(): { totalClips: number; pinnedClips: number; totalSnippets: number; totalMaskRules: number } {
    const totalClips = this.db.prepare('SELECT COUNT(*) as count FROM clips').get() as any;
    const pinnedClips = this.db.prepare('SELECT COUNT(*) as count FROM clips WHERE pinned = 1').get() as any;
    const totalSnippets = this.db.prepare('SELECT COUNT(*) as count FROM snippets').get() as any;
    const totalMaskRules = this.db.prepare('SELECT COUNT(*) as count FROM mask_rules').get() as any;

    return {
      totalClips: totalClips.count,
      pinnedClips: pinnedClips.count,
      totalSnippets: totalSnippets.count,
      totalMaskRules: totalMaskRules.count,
    };
  }

  truncateClips(): number {
    // Clear FTS index
    this.db.prepare('DELETE FROM clips_fts').run();
    this.db.prepare('DELETE FROM clips_fts_mapping').run();
    const result = this.db.prepare('DELETE FROM clips').run();
    return result.changes;
  }

  truncateSnippets(): number {
    const result = this.db.prepare('DELETE FROM snippets').run();
    return result.changes;
  }

  truncateMaskRules(): number {
    const result = this.db.prepare('DELETE FROM mask_rules').run();
    return result.changes;
  }

  truncateAll(): void {
    this.db.prepare('DELETE FROM pins').run();
    this.db.prepare('DELETE FROM clips_fts').run();
    this.db.prepare('DELETE FROM clips_fts_mapping').run();
    this.db.prepare('DELETE FROM clips').run();
    this.db.prepare('DELETE FROM snippets').run();
    this.db.prepare('DELETE FROM mask_rules').run();
  }

  /**
   * Rebuild the FTS index from all clips in the database
   */
  rebuildFtsIndex(): void {
    this.db.prepare('DELETE FROM clips_fts').run();
    this.db.prepare('DELETE FROM clips_fts_mapping').run();
    const rows = this.db.prepare('SELECT id, content FROM clips').all() as any[];
    for (const row of rows) {
      const rowid = this.getFtsRowid(row.id);
      this.db.prepare('INSERT INTO clips_fts(rowid, content) VALUES (?, ?)').run(rowid, row.content);
      this.db.prepare('INSERT INTO clips_fts_mapping(clip_id, fts_rowid) VALUES (?, ?)').run(row.id, rowid);
    }
  }

  /**
   * Optimize the FTS index for better query performance
   */
  optimizeFtsIndex(): void {
    this.db.prepare('INSERT INTO clips_fts(clips_fts) VALUES (?)').run('optimize');
  }

  close(): void {
    this.db.close();
  }
}
