import { Clip, Snippet, MaskRule, Pin, ClipHistoryConfig } from './models';

export class ClipStorage {
  private db: any;
  private dbPath: string;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
    this.db = this.initDB();
  }

  private initDB(): any {
    const Database = require('better-sqlite3');
    const db = new Database(this.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

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

      CREATE INDEX IF NOT EXISTS idx_clips_content ON clips(content);
      CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at);
      CREATE INDEX IF NOT EXISTS idx_clips_pinned ON clips(pinned);
      CREATE INDEX IF NOT EXISTS idx_clips_hash ON clips(hash);
      CREATE INDEX IF NOT EXISTS idx_snippets_name ON snippets(name);
    `);

    return db;
  }

  saveClip(clip: Clip): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO clips (id, content, created_at, pinned, hash) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(clip.id, clip.content, clip.createdAt, clip.pinned ? 1 : 0, clip.hash);
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

    if (options?.limit) {
      conditions.push('LIMIT ?');
      params.push(options.limit);
    }

    if (options?.offset) {
      conditions.push('OFFSET ?');
      params.push(options.offset);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

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

  deleteClip(id: string): boolean {
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

  deleteMaskRule(id: string): boolean {
    const result = this.db.prepare('DELETE FROM mask_rules WHERE id = ?').run(id);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
