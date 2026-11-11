import * as vscode from 'vscode';
import { HistoryManager, Clip, Snippet, SnippetEngine, MaskEngine, MaskRule } from '@sentry-clip/core';

export interface WebviewMessage {
  type: string;
  [key: string]: any;
}

export interface WebviewManagerOptions {
  historyManager: HistoryManager;
  extensionUri: vscode.Uri;
}

export class WebviewManager {
  private panel: vscode.WebviewPanel | undefined;
  private historyManager: HistoryManager;
  private extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private snippetEngine: SnippetEngine | undefined;
  private maskEngine: MaskEngine;

  constructor(options: WebviewManagerOptions) {
    this.historyManager = options.historyManager;
    this.extensionUri = options.extensionUri;
    this.maskEngine = new MaskEngine();
    // Get mask rules from storage
    const maskRules = this.historyManager.getConfig().enableMasking
      ? this.maskEngine.getRules()
      : [];
    // Initialize snippet engine
    this.snippetEngine = new SnippetEngine(this.historyManager.getAllSnippets());
  }

  get panelVisible(): boolean {
    return this.panel !== undefined && this.panel.visible;
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'sentryClip',
      'Sentry Clip',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      }
    );

    this.panel = panel;

    // Listen for view state changes (visibility changes)
    panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible) {
          this.sendInitMessage();
        }
      },
      null,
      this.disposables
    );

    // Listen for dispose
    panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      null,
      this.disposables
    );

    // Listen for messages from webview
    panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
      null,
      this.disposables
    );

    this.disposables.push(panel);
    this.sendInitMessage();
  }

  private sendInitMessage(): void {
    if (!this.panel) return;

    const clips = this.historyManager.getClips({ limit: 200 }).map((clip) => ({
      id: clip.id,
      content: clip.content,
      pinned: clip.pinned,
      relativeTime: this.historyManager.getRelativeTime(clip.createdAt),
    }));

    const snippets = this.historyManager.getAllSnippets().map((snippet) => ({
      id: snippet.id,
      name: snippet.name,
      content: snippet.content,
      placeholders: snippet.placeholders,
    }));

    const maskRules = this.maskEngine.getRules();

    const builtinPlaceholders = this.snippetEngine
      ? this.snippetEngine.getBuiltInPlaceholders()
      : [];

    this.panel.webview.html = this.getHtml(clips, snippets, maskRules, builtinPlaceholders);
  }

  private getHtml(clips: any[], snippets: any[], maskRules: any[], builtinPlaceholders: any[]): string {
    const cspSource = this.panel!.webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src '${cspSource}' 'unsafe-inline'; script-src '${cspSource}' 'unsafe-inline'; img-src '${cspSource}' data:;">
  <title>Sentry Clip</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --fg2: var(--vscode-descriptionForeground, #858585);
      --border: var(--vscode-panel-borderStyle, #3c3c3c);
      --accent: var(--vscode-button-background, #0e639c);
      --hover: var(--vscode-list-hoverBackground, #2a2d2e);
      --active: var(--vscode-list-activeSelectionBackground, #094771);
      --pin: #ffd700;
      --success: #4ec9b0;
      --error: #f44747;
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-border: var(--vscode-input-border, #555);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-placeholder: var(--vscode-input-placeholderForeground, #858585);
      --badge-bg: var(--vscode-badge-background, #4d4d4d);
      --badge-fg: var(--vscode-badge-foreground, #ffffff);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
      font-size: 13px;
      color: var(--fg);
      background: var(--bg);
      height: 100vh;
      overflow: hidden;
    }
    .container { display: flex; flex-direction: column; height: 100vh; }

    /* Tabs */
    .tabs { display: flex; border-bottom: 1px solid var(--border); background: var(--bg); }
    .tab-btn {
      padding: 8px 16px;
      background: transparent;
      border: none;
      color: var(--fg2);
      font-size: 12px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab-btn:hover { color: var(--fg); }
    .tab-btn.active { color: var(--fg); border-bottom-color: var(--accent); }

    /* Tab content */
    .tab-content { display: none; flex-direction: column; height: 100%; }
    .tab-content.active { display: flex; }

    /* Header */
    .header { padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .header h1 { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
    .search-box {
      width: 100%;
      padding: 6px 10px 6px 28px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--input-fg);
      font-size: 13px;
      border-radius: 3px;
      outline: none;
    }
    .search-box:focus { border-color: var(--accent); }
    .search-wrap { position: relative; }
    .search-icon { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--fg2); font-size: 13px; }
    .filters { display: flex; gap: 4px; margin-top: 6px; }
    .filter-btn {
      padding: 3px 10px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg2);
      font-size: 12px;
      border-radius: 2px;
      cursor: pointer;
    }
    .filter-btn:hover { background: var(--hover); color: var(--fg); }
    .filter-btn.active { background: var(--accent); border-color: var(--accent); color: white; }
    .stats { font-size: 11px; color: var(--fg2); margin-top: 4px; }

    /* Clip list */
    .clip-list { flex: 1; overflow-y: auto; }
    .clip-item {
      display: flex;
      align-items: flex-start;
      padding: 6px 12px;
      cursor: pointer;
      border-left: 2px solid transparent;
      transition: background 0.1s;
    }
    .clip-item:hover { background: var(--hover); }
    .clip-item.selected { background: var(--active); border-left-color: var(--accent); }
    .clip-item.pinned { border-left-color: var(--pin); }
    .clip-info { flex: 1; min-width: 0; margin-right: 8px; }
    .clip-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 13px;
    }
    .clip-meta { font-size: 11px; color: var(--fg2); margin-top: 1px; }
    .pin-btn {
      background: none; border: none; color: var(--fg2); font-size: 14px;
      cursor: pointer; padding: 2px 4px; border-radius: 2px; flex-shrink: 0;
    }
    .pin-btn:hover { background: rgba(255,255,255,0.1); }
    .pin-btn.pinned { color: var(--pin); }

    /* Empty state */
    .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--fg2); text-align: center; padding: 20px; }
    .empty-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.5; }

    /* Actions */
    .actions { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border); background: var(--bg); }
    .action-btn {
      padding: 4px 10px; font-size: 12px; border-radius: 2px; cursor: pointer; border: none;
    }
    .action-btn.primary { background: var(--accent); color: white; }
    .action-btn.primary:hover { opacity: 0.9; }
    .action-btn.secondary { background: transparent; border: 1px solid var(--border); color: var(--fg); }
    .action-btn.danger { background: transparent; border: 1px solid var(--error); color: var(--error); }
    .action-btn.small { padding: 2px 8px; font-size: 11px; }

    /* Toast */
    .toast {
      position: fixed; bottom: 16px; right: 16px; padding: 8px 14px;
      background: var(--bg); border: 1px solid var(--border); border-radius: 3px;
      font-size: 12px; transform: translateY(80px); opacity: 0; transition: all 0.2s; z-index: 100;
    }
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast.success { border-left: 3px solid var(--success); }
    .toast.error { border-left: 3px solid var(--error); }

    /* Masking tab */
    .masking-section { padding: 12px 16px; overflow-y: auto; flex: 1; }
    .masking-section h2 { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
    .masking-section h3 { font-size: 13px; font-weight: 600; margin: 12px 0 6px; color: var(--fg2); }
    .mask-rule-item {
      display: flex; align-items: center; gap: 8px; padding: 6px 10px;
      background: var(--input-bg); border: 1px solid var(--border); border-radius: 3px;
      margin-bottom: 6px; font-size: 12px;
    }
    .mask-rule-item .rule-name { font-weight: 600; color: var(--accent); min-width: 80px; }
    .mask-rule-item .rule-pattern { flex: 1; font-family: monospace; color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mask-rule-item .rule-actions { display: flex; gap: 4px; flex-shrink: 0; }
    .toggle-switch {
      position: relative; width: 32px; height: 16px; flex-shrink: 0;
    }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .toggle-slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background: var(--border); border-radius: 8px; transition: 0.2s;
    }
    .toggle-slider:before {
      content: ""; position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px;
      background: white; border-radius: 50%; transition: 0.2s;
    }
    .toggle-switch input:checked + .toggle-slider { background: var(--accent); }
    .toggle-switch input:checked + .toggle-slider:before { transform: translateX(16px); }
    .preview-box {
      background: var(--input-bg); border: 1px solid var(--border); border-radius: 3px;
      padding: 8px 10px; font-family: monospace; font-size: 12px; min-height: 60px;
      white-space: pre-wrap; word-break: break-all; margin-top: 8px;
    }
    .preview-box .masked { color: var(--error); text-decoration: line-through; }
    .preview-box .unmasked { color: var(--success); }
    .form-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
    .form-row input, .form-row select {
      flex: 1; padding: 5px 8px; background: var(--input-bg); border: 1px solid var(--input-border);
      color: var(--input-fg); font-size: 12px; border-radius: 3px; outline: none;
    }
    .form-row input:focus { border-color: var(--accent); }
    .form-row input::placeholder { color: var(--input-placeholder); }
    .form-row label { font-size: 12px; color: var(--fg2); min-width: 60px; }

    /* Snippets tab */
    .snippets-section { padding: 12px 16px; overflow-y: auto; flex: 1; }
    .snippets-section h2 { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
    .snippet-item {
      display: flex; align-items: center; gap: 8px; padding: 6px 10px;
      background: var(--input-bg); border: 1px solid var(--border); border-radius: 3px;
      margin-bottom: 6px; font-size: 12px; cursor: pointer;
    }
    .snippet-item:hover { background: var(--hover); }
    .snippet-item.selected { border-color: var(--accent); }
    .snippet-item .snip-name { font-weight: 600; color: var(--accent); min-width: 80px; }
    .snippet-item .snip-content { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; color: var(--fg2); }
    .snippet-item .snip-actions { display: flex; gap: 4px; flex-shrink: 0; }
    .placeholder-tag {
      display: inline-block; background: var(--badge-bg); color: var(--badge-fg);
      font-size: 10px; padding: 1px 5px; border-radius: 2px; margin: 1px 2px;
      font-family: monospace;
    }
    .placeholder-hint {
      background: var(--input-bg); border: 1px solid var(--border); border-radius: 3px;
      padding: 8px 10px; margin-top: 8px; font-size: 11px; color: var(--fg2);
    }
    .placeholder-hint strong { color: var(--fg); }
    .snippet-editor {
      width: 100%; min-height: 80px; padding: 8px 10px; background: var(--input-bg);
      border: 1px solid var(--input-border); color: var(--input-fg); font-size: 12px;
      font-family: monospace; border-radius: 3px; outline: none; resize: vertical;
      margin-top: 8px;
    }
    .snippet-editor:focus { border-color: var(--accent); }
    .snippet-editor::placeholder { color: var(--input-placeholder); }
    .snippet-preview {
      background: var(--input-bg); border: 1px solid var(--border); border-radius: 3px;
      padding: 8px 10px; font-family: monospace; font-size: 12px; min-height: 40px;
      white-space: pre-wrap; word-break: break-all; margin-top: 8px; color: var(--success);
    }
    .snippet-preview .unresolved { color: var(--error); }
  </style>
</head>
<body>
  <div class="container">
    <!-- Tabs -->
    <div class="tabs">
      <button class="tab-btn active" data-tab="history">📋 History</button>
      <button class="tab-btn" data-tab="masking">🛡️ Masking</button>
      <button class="tab-btn" data-tab="snippets">✂️ Snippets</button>
    </div>

    <!-- History Tab -->
    <div class="tab-content active" id="tab-history">
      <div class="header">
        <h1>📋 Sentry Clip</h1>
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-box" id="searchInput" placeholder="Search clipboard history..." autocomplete="off">
        </div>
        <div class="filters">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="pinned">📌 Pinned</button>
          <button class="filter-btn" data-filter="unpinned">Unpinned</button>
        </div>
        <div class="stats" id="stats"></div>
      </div>
      <div class="clip-list" id="clipList"></div>
      <div class="actions">
        <button class="action-btn primary" id="copyAllBtn">Copy All</button>
        <button class="action-btn secondary" id="refreshBtn">Refresh</button>
        <button class="action-btn danger" id="clearBtn">Clear</button>
      </div>
    </div>

    <!-- Masking Tab -->
    <div class="tab-content" id="tab-masking">
      <div class="masking-section">
        <h2>🛡️ Sensitive Data Masking</h2>
        <h3>Mask Rules</h3>
        <div id="maskRuleList"></div>
        <div class="form-row" style="margin-top: 12px;">
          <input type="text" id="newRuleName" placeholder="Rule name (e.g. Email)">
          <input type="text" id="newRulePattern" placeholder="Regex pattern (e.g. [\\\\w.+-]+@[\\\\w-]+\\\\.[\\\\w.]+)">
          <input type="text" id="newRuleReplacement" placeholder="Replacement (e.g. [REDACTED])" style="max-width: 120px;">
          <button class="action-btn primary small" id="addRuleBtn">Add</button>
        </div>
        <h3>Preview</h3>
        <div class="form-row">
          <input type="text" id="previewInput" placeholder="Enter text to preview masking...">
        </div>
        <div class="preview-box" id="previewOutput">Type text above to see masked output...</div>
      </div>
    </div>

    <!-- Snippets Tab -->
    <div class="tab-content" id="tab-snippets">
      <div class="snippets-section">
        <h2>✂️ Snippets</h2>
        <div id="snippetList"></div>
        <h3>New Snippet</h3>
        <div class="form-row">
          <input type="text" id="newSnippetName" placeholder="Snippet name">
          <button class="action-btn primary small" id="createSnippetBtn">Create</button>
        </div>
        <div id="snippetEditor" style="display:none;">
          <div class="form-row">
            <label>Name:</label>
            <input type="text" id="editSnippetName">
          </div>
          <textarea class="snippet-editor" id="editSnippetContent" placeholder="Enter snippet content with {{placeholders}}"></textarea>
          <div id="snippetPlaceholders" style="margin-top: 4px;"></div>
          <div class="snippet-preview" id="snippetPreview">Preview will appear here...</div>
          <div class="form-row" style="margin-top: 8px;">
            <button class="action-btn primary small" id="saveSnippetBtn">Save</button>
            <button class="action-btn secondary small" id="cancelSnippetBtn">Cancel</button>
            <button class="action-btn danger small" id="deleteSnippetBtn">Delete</button>
          </div>
        </div>
        <div class="placeholder-hint">
          <strong>Built-in placeholders:</strong>
          <div id="builtinPlaceholders" style="margin-top: 4px;"></div>
        </div>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>

  <script>
    let clips = [];
    let filter = 'all';
    let search = '';
    let selectedId = null;
    let snippets = [];
    let maskRules = [];
    let builtinPlaceholders = [];
    let editingSnippetId = null;
    let activeTab = 'history';

    const vsc = acquireVsCodeApi();

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    // ── Tab switching ──
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        document.getElementById('tab-' + activeTab).classList.add('active');
      });
    });

    // ── History tab ──
    function filtered() {
      let r = [...clips];
      if (filter === 'pinned') r = r.filter(c => c.pinned);
      else if (filter === 'unpinned') r = r.filter(c => !c.pinned);
      if (search) { const q = search.toLowerCase(); r = r.filter(c => c.content.toLowerCase().includes(q)); }
      return r;
    }

    function render() {
      const items = filtered();
      if (items.length === 0) {
        document.getElementById('clipList').innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div>' + (search ? 'No matching clips' : 'No clipboard history') + '</div></div>';
      } else {
        document.getElementById('clipList').innerHTML = items.map(c =>
          '<div class="clip-item ' + (c.pinned ? 'pinned' : '') + (selectedId === c.id ? ' selected' : '') + '" data-id="' + c.id + '">' +
            '<div class="clip-info">' +
              '<div class="clip-text">' + esc(c.content) + '</div>' +
              '<div class="clip-meta">' + (c.relativeTime || '') + '</div>' +
            '</div>' +
            '<button class="pin-btn ' + (c.pinned ? 'pinned' : '') + '" data-pin="' + c.id + '">' + (c.pinned ? '★' : '☆') + '</button>' +
          '</div>'
        ).join('');
        document.getElementById('clipList').querySelectorAll('.clip-item').forEach(el => {
          el.addEventListener('click', (e) => {
            if (e.target.classList.contains('pin-btn')) return;
            selectedId = el.dataset.id;
            const clip = clips.find(c => c.id === selectedId);
            if (clip) {
              vsc.postMessage({ type: 'copy', clipId: clip.id, content: clip.content });
              showToast('Copied to clipboard');
            }
            render();
          });
        });
        document.getElementById('clipList').querySelectorAll('.pin-btn').forEach(el => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            vsc.postMessage({ type: 'togglePin', clipId: el.dataset.pin });
            render();
          });
        });
      }
      const total = clips.length;
      const pinned = clips.filter(c => c.pinned).length;
      document.getElementById('stats').textContent = total + ' clips (' + pinned + ' pinned)' + (search ? ' · ' + items.length + ' match' : '');
    }

    document.getElementById('searchInput').addEventListener('input', function(e) { search = e.target.value; render(); });

    document.querySelectorAll('.filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        filter = btn.dataset.filter;
        render();
      });
    });

    document.getElementById('copyAllBtn').addEventListener('click', function() {
      var items = filtered();
      if (items.length) {
        vsc.postMessage({ type: 'copyAll', content: items.map(function(c) { return c.content; }).join('\\n') });
        showToast('Copied ' + items.length + ' clips');
      }
    });

    document.getElementById('refreshBtn').addEventListener('click', function() {
      vsc.postMessage({ type: 'refresh' });
      showToast('Refreshing...');
    });

    document.getElementById('clearBtn').addEventListener('click', function() {
      if (confirm('Clear all clipboard history?')) {
        vsc.postMessage({ type: 'clearHistory' });
        showToast('History cleared');
      }
    });

    // ── Masking tab ──
    function renderMaskRules() {
      const list = document.getElementById('maskRuleList');
      if (maskRules.length === 0) {
        list.innerHTML = '<div style="color: var(--fg2); font-size: 12px; padding: 8px 0;">No mask rules defined. Add one below to protect sensitive data.</div>';
      } else {
        list.innerHTML = maskRules.map(r =>
          '<div class="mask-rule-item">' +
            '<label class="toggle-switch"><input type="checkbox" ' + (r.enabled ? 'checked' : '') + ' data-rule-id="' + r.id + '" class="rule-toggle"><span class="toggle-slider"></span></label>' +
            '<span class="rule-name">' + esc(r.name) + '</span>' +
            '<span class="rule-pattern" title="' + esc(r.pattern) + '">' + esc(r.pattern) + '</span>' +
            '<span style="color: var(--fg2); font-size: 11px;">→ ' + esc(r.replacement) + '</span>' +
            '<div class="rule-actions">' +
              '<button class="action-btn secondary small" data-edit-rule="' + r.id + '">✏️</button>' +
              '<button class="action-btn danger small" data-del-rule="' + r.id + '">✕</button>' +
            '</div>' +
          '</div>'
        ).join('');

        // Toggle handlers
        list.querySelectorAll('.rule-toggle').forEach(cb => {
          cb.addEventListener('change', function() {
            vsc.postMessage({ type: 'toggleMaskRule', ruleId: this.dataset.ruleId, enabled: this.checked });
          });
        });

        // Delete handlers
        list.querySelectorAll('[data-del-rule]').forEach(btn => {
          btn.addEventListener('click', function() {
            vsc.postMessage({ type: 'deleteMaskRule', ruleId: this.dataset.delRule });
            vsc.postMessage({ type: 'refresh' });
          });
        });

        // Edit handlers
        list.querySelectorAll('[data-edit-rule]').forEach(btn => {
          btn.addEventListener('click', function() {
            const rule = maskRules.find(r => r.id === this.dataset.editRule);
            if (rule) {
              document.getElementById('newRuleName').value = rule.name;
              document.getElementById('newRulePattern').value = rule.pattern;
              document.getElementById('newRuleReplacement').value = rule.replacement;
              vsc.postMessage({ type: 'editMaskRule', ruleId: rule.id });
            }
          });
        });
      }
    }

    document.getElementById('addRuleBtn').addEventListener('click', function() {
      const name = document.getElementById('newRuleName').value.trim();
      const pattern = document.getElementById('newRulePattern').value.trim();
      const replacement = document.getElementById('newRuleReplacement').value.trim();
      if (!name || !pattern) {
        showToast('Name and pattern are required', 'error');
        return;
      }
      try {
        new RegExp(pattern);
      } catch (e) {
        showToast('Invalid regex: ' + e.message, 'error');
        return;
      }
      vsc.postMessage({ type: 'addMaskRule', name: name, pattern: pattern, replacement: replacement });
      document.getElementById('newRuleName').value = '';
      document.getElementById('newRulePattern').value = '';
      document.getElementById('newRuleReplacement').value = '';
      showToast('Rule added');
    });

    // Preview masking
    document.getElementById('previewInput').addEventListener('input', function() {
      const text = this.value;
      const output = document.getElementById('previewOutput');
      if (!text) {
        output.textContent = 'Type text above to see masked output...';
        return;
      }
      vsc.postMessage({ type: 'previewMask', text: text });
    });

    // ── Snippets tab ──
    function renderSnippets() {
      const list = document.getElementById('snippetList');
      if (snippets.length === 0) {
        list.innerHTML = '<div style="color: var(--fg2); font-size: 12px; padding: 8px 0;">No snippets defined. Create one below.</div>';
      } else {
        list.innerHTML = snippets.map(s =>
          '<div class="snippet-item ' + (editingSnippetId === s.id ? 'selected' : '') + '" data-snip-id="' + s.id + '">' +
            '<span class="snip-name">' + esc(s.name) + '</span>' +
            '<span class="snip-content">' + esc(s.content) + '</span>' +
            '<div class="snip-actions">' +
              '<button class="action-btn secondary small" data-copy-snip="' + s.id + '">📋</button>' +
              '<button class="action-btn danger small" data-del-snip="' + s.id + '">✕</button>' +
            '</div>' +
          '</div>'
        ).join('');

        list.querySelectorAll('.snippet-item').forEach(el => {
          el.addEventListener('click', function(e) {
            if (e.target.closest('.snip-actions')) return;
            openSnippetEditor(this.dataset.snipId);
          });
        });

        list.querySelectorAll('[data-copy-snip]').forEach(btn => {
          btn.addEventListener('click', function() {
            const snip = snippets.find(s => s.id === this.dataset.copySnip);
            if (snip) {
              vsc.postMessage({ type: 'copySnippet', snippetId: snip.id, content: snip.content });
              showToast('Snippet copied');
            }
          });
        });

        list.querySelectorAll('[data-del-snip]').forEach(btn => {
          btn.addEventListener('click', function() {
            vsc.postMessage({ type: 'deleteSnippet', snippetId: this.dataset.delSnip });
            if (editingSnippetId === this.dataset.delSnip) {
              editingSnippetId = null;
              document.getElementById('snippetEditor').style.display = 'none';
            }
            vsc.postMessage({ type: 'refresh' });
          });
        });
      }

      // Builtin placeholders
      const phContainer = document.getElementById('builtinPlaceholders');
      phContainer.innerHTML = builtinPlaceholders.map(p =>
        '<span class="placeholder-tag" title="' + esc(p.description) + '">' + esc('{{' + p.name + '}}') + '</span>'
      ).join(' ');
    }

    function openSnippetEditor(id) {
      const snip = snippets.find(s => s.id === id);
      if (!snip) return;
      editingSnippetId = id;
      document.getElementById('editSnippetName').value = snip.name;
      document.getElementById('editSnippetContent').value = snip.content;
      document.getElementById('snippetEditor').style.display = 'block';
      updateSnippetPreview();
      renderSnippets();
    }

    function updateSnippetPreview() {
      const content = document.getElementById('editSnippetContent').value;
      const preview = document.getElementById('snippetPreview');
      const phContainer = document.getElementById('snippetPlaceholders');

      // Extract placeholders
      const phRegex = /\\{\\{(\\w+)\\}\\}/g;
      const placeholders = [];
      let match;
      while ((match = phRegex.exec(content)) !== null) {
        if (!placeholders.includes(match[1])) placeholders.push(match[1]);
      }

      phContainer.innerHTML = placeholders.length > 0
        ? placeholders.map(p => '<span class="placeholder-tag">' + esc('{{' + p + '}}') + '</span>').join(' ')
        : '<span style="color: var(--fg2); font-size: 11px;">No placeholders detected</span>';

      // Preview with resolution simulation
      let previewText = content;
      const phRegex2 = /\\{\\{(\\w+)\\}\\}/g;
      previewText = content.replace(phRegex2, (match, name) => {
        if (builtinPlaceholders.some(p => p.name === name)) {
          return '<span class="unresolved">[' + name + ']</span>';
        }
        return '<span class="unresolved">[' + name + ']</span>';
      });

      preview.innerHTML = previewText || '<span style="color: var(--fg2);">Empty snippet</span>';
    }

    document.getElementById('editSnippetContent').addEventListener('input', updateSnippetPreview);
    document.getElementById('editSnippetName').addEventListener('input', updateSnippetPreview);

    document.getElementById('createSnippetBtn').addEventListener('click', function() {
      const name = document.getElementById('newSnippetName').value.trim();
      if (!name) {
        showToast('Snippet name is required', 'error');
        return;
      }
      vsc.postMessage({ type: 'createSnippet', name: name });
      document.getElementById('newSnippetName').value = '';
      showToast('Snippet created');
    });

    document.getElementById('saveSnippetBtn').addEventListener('click', function() {
      if (!editingSnippetId) return;
      const name = document.getElementById('editSnippetName').value.trim();
      const content = document.getElementById('editSnippetContent').value;
      if (!name || !content) {
        showToast('Name and content are required', 'error');
        return;
      }
      vsc.postMessage({ type: 'saveSnippet', snippetId: editingSnippetId, name: name, content: content });
      editingSnippetId = null;
      document.getElementById('snippetEditor').style.display = 'none';
      vsc.postMessage({ type: 'refresh' });
      showToast('Snippet saved');
    });

    document.getElementById('cancelSnippetBtn').addEventListener('click', function() {
      editingSnippetId = null;
      document.getElementById('snippetEditor').style.display = 'none';
      renderSnippets();
    });

    document.getElementById('deleteSnippetBtn').addEventListener('click', function() {
      if (!editingSnippetId) return;
      if (confirm('Delete this snippet?')) {
        vsc.postMessage({ type: 'deleteSnippet', snippetId: editingSnippetId });
        editingSnippetId = null;
        document.getElementById('snippetEditor').style.display = 'none';
        vsc.postMessage({ type: 'refresh' });
        showToast('Snippet deleted');
      }
    });

    // ── Toast ──
    function showToast(msg, level) {
      level = level || 'success';
      const toastEl = document.getElementById('toast');
      toastEl.textContent = msg;
      toastEl.className = 'toast ' + level + ' show';
      setTimeout(function() { toastEl.classList.remove('show'); }, 2000);
    }

    // ── Message handling ──
    window.addEventListener('message', function(e) {
      var m = e.data;
      if (m.type === 'init') {
        clips = m.clips || [];
        snippets = m.snippets || [];
        maskRules = m.maskRules || [];
        builtinPlaceholders = m.builtinPlaceholders || [];
        render();
        renderMaskRules();
        renderSnippets();
      }
      else if (m.type === 'update') {
        clips = m.clips || clips;
        render();
      }
      else if (m.type === 'clear') {
        clips = [];
        render();
      }
      else if (m.type === 'toast') {
        showToast(m.message, m.level);
      }
      else if (m.type === 'maskPreview') {
        const output = document.getElementById('previewOutput');
        output.innerHTML = m.preview || 'No masking applied';
      }
      else if (m.type === 'refresh') {
        vsc.postMessage({ type: 'requestInit' });
      }
    });

    vsc.postMessage({ type: 'requestInit' });
  </script>
</body>
</html>`;
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'requestInit':
        this.sendInitMessage();
        break;

      case 'copy': {
        try {
          await vscode.env.clipboard.writeText(message.content);
          this.showToast('Copied to clipboard');
        } catch (err) {
          this.showToast(`Error: ${err}`, 'error');
        }
        break;
      }

      case 'togglePin': {
        try {
          this.historyManager.togglePin(message.clipId);
          this.sendInitMessage();
          this.showToast('Toggled pin');
        } catch (err) {
          this.showToast(`Error: ${err}`, 'error');
        }
        break;
      }

      case 'copyAll': {
        try {
          await vscode.env.clipboard.writeText(message.content);
          this.showToast('Copied all clips');
        } catch (err) {
          this.showToast(`Error: ${err}`, 'error');
        }
        break;
      }

      case 'refresh': {
        this.sendInitMessage();
        this.showToast('Refreshed');
        break;
      }

      case 'clearHistory': {
        try {
          this.historyManager.clearHistory();
          this.sendInitMessage();
          this.showToast('History cleared');
        } catch (err) {
          this.showToast(`Error: ${err}`, 'error');
        }
        break;
      }

      case 'copySnippet': {
        try {
          await vscode.env.clipboard.writeText(message.content);
          this.showToast(`Snippet "${message.snippetName || ''}" copied`);
        } catch (err) {
          this.showToast(`Error: ${err}`, 'error');
        }
        break;
      }

      // ── Masking handlers ──

      case 'addMaskRule': {
        try {
          const rule: MaskRule = {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            name: message.name,
            pattern: new RegExp(message.pattern),
            replacement: message.replacement,
            enabled: true,
          };
          this.maskEngine.addRule(rule);
          this.sendInitMessage();
          this.showToast(`Rule "${message.name}" added`);
        } catch (err) {
          this.showToast(`Error adding rule: ${err}`, 'error');
        }
        break;
      }

      case 'toggleMaskRule': {
        try {
          const rule = this.maskEngine.getRules().find(r => r.id === message.ruleId);
          if (rule) {
            rule.enabled = message.enabled;
            this.sendInitMessage();
            this.showToast(`Rule ${message.enabled ? 'enabled' : 'disabled'}`);
          }
        } catch (err) {
          this.showToast(`Error: ${err}`, 'error');
        }
        break;
      }

      case 'deleteMaskRule': {
        try {
          this.maskEngine.removeRule(message.ruleId);
          this.sendInitMessage();
          this.showToast('Rule deleted');
        } catch (err) {
          this.showToast(`Error: ${err}`, 'error');
        }
        break;
      }

      case 'editMaskRule': {
        // For now, just acknowledge the edit request and let the user modify the form
        this.showToast('Edit mode: modify the form fields and add a new rule');
        break;
      }

      case 'previewMask': {
        try {
          const preview = this.maskEngine.maskPreview(message.text);
          this.panel?.webview.postMessage({ type: 'maskPreview', preview });
        } catch (err) {
          this.showToast(`Error: ${err}`, 'error');
        }
        break;
      }

      // ── Snippet handlers ──

      case 'createSnippet': {
        try {
          const snippet: Snippet = {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            name: message.name,
            content: '',
            placeholders: [],
            createdAt: Date.now(),
          };
          this.historyManager.addSnippet(snippet);
          this.snippetEngine = new SnippetEngine(this.historyManager.getAllSnippets());
          this.sendInitMessage();
          this.showToast(`Snippet "${message.name}" created`);
        } catch (err) {
          this.showToast(`Error creating snippet: ${err}`, 'error');
        }
        break;
      }

      case 'saveSnippet': {
        try {
          const existing = this.historyManager.getSnippet(message.snippetId);
          if (existing) {
            existing.name = message.name;
            existing.content = message.content;
            existing.placeholders = this.snippetEngine
              ? this.snippetEngine.extractPlaceholders(message.content)
              : [];
            this.historyManager.addSnippet(existing);
            this.snippetEngine = new SnippetEngine(this.historyManager.getAllSnippets());
            this.sendInitMessage();
            this.showToast(`Snippet "${message.name}" saved`);
          }
        } catch (err) {
          this.showToast(`Error saving snippet: ${err}`, 'error');
        }
        break;
      }

      case 'deleteSnippet': {
        try {
          this.historyManager.deleteSnippet(message.snippetId);
          this.snippetEngine = new SnippetEngine(this.historyManager.getAllSnippets());
          this.sendInitMessage();
          this.showToast('Snippet deleted');
        } catch (err) {
          this.showToast(`Error: ${err}`, 'error');
        }
        break;
      }

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private showToast(message: string, level: 'success' | 'error' = 'success'): void {
    if (this.panel) {
      this.panel.webview.postMessage({ type: 'toast', message, level });
    }
  }

  update(): void {
    if (this.panel) {
      this.sendInitMessage();
    }
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
