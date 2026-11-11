import * as vscode from 'vscode';
import { HistoryManager, Clip, Snippet } from '@sentry-clip/core';

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

  constructor(options: WebviewManagerOptions) {
    this.historyManager = options.historyManager;
    this.extensionUri = options.extensionUri;
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

    this.panel.webview.html = this.getHtml(clips, snippets);
  }

  private getHtml(clips: any[], snippets: any[]): string {
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
    .header { padding: 12px 16px; background: var(--bg); border-bottom: 1px solid var(--border); }
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
    .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--fg2); text-align: center; padding: 20px; }
    .empty-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.5; }
    .actions { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border); background: var(--bg); }
    .action-btn {
      padding: 4px 10px; font-size: 12px; border-radius: 2px; cursor: pointer; border: none;
    }
    .action-btn.primary { background: var(--accent); color: white; }
    .action-btn.primary:hover { opacity: 0.9; }
    .action-btn.secondary { background: transparent; border: 1px solid var(--border); color: var(--fg); }
    .action-btn.danger { background: transparent; border: 1px solid var(--error); color: var(--error); }
    .toast {
      position: fixed; bottom: 16px; right: 16px; padding: 8px 14px;
      background: var(--bg); border: 1px solid var(--border); border-radius: 3px;
      font-size: 12px; transform: translateY(80px); opacity: 0; transition: all 0.2s; z-index: 100;
    }
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast.success { border-left: 3px solid var(--success); }
    .toast.error { border-left: 3px solid var(--error); }
  </style>
</head>
<body>
  <div class="container">
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
  <div class="toast" id="toast"></div>

  <script>
    let clips = [];
    let filter = 'all';
    let search = '';
    let selectedId = null;

    const clipList = document.getElementById('clipList');
    const searchInput = document.getElementById('searchInput');
    const statsEl = document.getElementById('stats');
    const toastEl = document.getElementById('toast');
    const vsc = acquireVsCodeApi();

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

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
        clipList.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div>' + (search ? 'No matching clips' : 'No clipboard history') + '</div></div>';
      } else {
        clipList.innerHTML = items.map(c =>
          '<div class="clip-item ' + (c.pinned ? 'pinned' : '') + (selectedId === c.id ? ' selected' : '') + '" data-id="' + c.id + '">' +
            '<div class="clip-info">' +
              '<div class="clip-text">' + esc(c.content) + '</div>' +
              '<div class="clip-meta">' + (c.relativeTime || '') + '</div>' +
            '</div>' +
            '<button class="pin-btn ' + (c.pinned ? 'pinned' : '') + '" data-pin="' + c.id + '">' + (c.pinned ? '★' : '☆') + '</button>' +
          '</div>'
        ).join('');
        clipList.querySelectorAll('.clip-item').forEach(el => {
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
        clipList.querySelectorAll('.pin-btn').forEach(el => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            vsc.postMessage({ type: 'togglePin', clipId: el.dataset.pin });
            render();
          });
        });
      }
      const total = clips.length;
      const pinned = clips.filter(c => c.pinned).length;
      statsEl.textContent = total + ' clips (' + pinned + ' pinned)' + (search ? ' · ' + items.length + ' match' : '');
    }

    function showToast(msg, level) {
      level = level || 'success';
      toastEl.textContent = msg;
      toastEl.className = 'toast ' + level + ' show';
      setTimeout(function() { toastEl.classList.remove('show'); }, 2000);
    }

    searchInput.addEventListener('input', function(e) { search = e.target.value; render(); });

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

    window.addEventListener('message', function(e) {
      var m = e.data;
      if (m.type === 'init') { clips = m.clips || []; render(); }
      else if (m.type === 'update') { clips = m.clips || clips; render(); }
      else if (m.type === 'clear') { clips = []; render(); }
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
