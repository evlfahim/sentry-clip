import * as vscode from 'vscode';
import { HistoryManager, Clip, Snippet, SnippetEngine } from '@sentry-clip/core';
import { WebviewManager } from './webview';

let historyManager: HistoryManager | undefined;
let snippetEngine: SnippetEngine | undefined;
let webviewManager: WebviewManager | undefined;
let extensionUri: vscode.Uri | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let statusBarInterval: ReturnType<typeof setInterval> | undefined;

function readConfig(): {
  maxHistory: number;
  enableMasking: boolean;
  enableSnippets: boolean;
  exclusionPatterns: string[];
  dbPath: string;
} {
  const config = vscode.workspace.getConfiguration('sentryClip');
  return {
    maxHistory: config.get<number>('maxHistory', 1000),
    enableMasking: config.get<boolean>('enableMasking', true),
    enableSnippets: config.get<boolean>('enableSnippets', true),
    exclusionPatterns: config.get<string[]>('exclusionPatterns', []),
    dbPath: config.get<string>('dbPath', ''),
  };
}

function getHistoryManager(): HistoryManager {
  if (!historyManager) {
    const cfg = readConfig();
    historyManager = new HistoryManager({
      maxHistory: cfg.maxHistory,
      enableMasking: cfg.enableMasking,
      enableSnippets: cfg.enableSnippets,
      exclusionPatterns: cfg.exclusionPatterns,
      dbPath: cfg.dbPath || undefined,
    });
    snippetEngine = new SnippetEngine(historyManager.getAllSnippets());
    if (extensionUri) {
      webviewManager = new WebviewManager({ historyManager, extensionUri, onDidChange: updateStatusBar });
    }
    // Start status bar refresh now that historyManager exists
    startStatusBarRefresh();
  }
  return historyManager;
}

function refreshConfig(): void {
  if (historyManager) {
    const cfg = readConfig();
    historyManager.setConfig({
      maxHistory: cfg.maxHistory,
      enableMasking: cfg.enableMasking,
      enableSnippets: cfg.enableSnippets,
      exclusionPatterns: cfg.exclusionPatterns,
      dbPath: cfg.dbPath || undefined,
    });
    // Rebuild snippet engine in case enableSnippets changed
    if (snippetEngine) {
      snippetEngine = new SnippetEngine(historyManager.getAllSnippets());
    }
    // Rebuild webview manager so its mask engine and snippet engine are fresh
    if (webviewManager && extensionUri) {
      webviewManager.dispose();
      webviewManager = new WebviewManager({ historyManager, extensionUri, onDidChange: updateStatusBar });
    }
    updateStatusBar();
  }
}

function createStatusBar(): vscode.StatusBarItem {
  const bar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  bar.text = '$(clipboard) Sentry Clip';
  bar.tooltip = 'Sentry Clip: Click to open clipboard history';
  bar.command = 'sentry-clip.showHistory';
  bar.show();
  return bar;
}

function updateStatusBar(): void {
  if (!statusBar || !historyManager) return;
  try {
    const stats = historyManager.getStats();
    const total = stats.totalClips;
    const pinned = stats.pinnedClips;
    statusBar.text = `$(clipboard) Sentry Clip · ${total} clips${pinned > 0 ? ' · ' + pinned + ' pinned' : ''}`;
    statusBar.tooltip = `Sentry Clip: ${total} clips${pinned > 0 ? ', ' + pinned + ' pinned' : ''}. Click to open.`;
  } catch {
    statusBar.text = '$(clipboard) Sentry Clip';
    statusBar.tooltip = 'Sentry Clip: Click to open clipboard history';
  }
}

function startStatusBarRefresh(): void {
  if (!statusBar || !historyManager) return;
  // Stop existing interval if any
  if (statusBarInterval) {
    clearInterval(statusBarInterval);
  }
  // Initial update
  updateStatusBar();
  // Refresh every 10 seconds
  statusBarInterval = setInterval(() => {
    updateStatusBar();
  }, 10000);
}

async function showQuickPickClips(
  clips: Clip[],
  title: string
): Promise<Clip | undefined> {
  if (clips.length === 0) {
    vscode.window.showInformationMessage('No clips found.');
    return undefined;
  }

  const items = clips.map((clip) => ({
    label: clip.content.length > 80 ? clip.content.substring(0, 80) + '…' : clip.content,
    description: clip.pinned ? '📌 pinned' : '',
    detail: historyManager?.getRelativeTime(clip.createdAt) ?? '',
    clip,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: title,
    matchOnDetail: true,
    matchOnDescription: true,
  });

  return selected?.clip;
}

async function showQuickPickSnippets(): Promise<Snippet | undefined> {
  if (!snippetEngine) {
    return undefined;
  }

  const snippets = snippetEngine.getSnippets();
  if (snippets.length === 0) {
    vscode.window.showInformationMessage('No snippets defined.');
    return undefined;
  }

  const items = snippets.map((snippet) => ({
    label: snippet.name,
    description: snippet.content.length > 60
      ? snippet.content.substring(0, 60) + '…'
      : snippet.content,
    detail: snippet.placeholders.length > 0
      ? `Placeholders: ${snippet.placeholders.join(', ')}`
      : 'No placeholders',
    snippet,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a snippet',
    matchOnDetail: true,
    matchOnDescription: true,
  });

  return selected?.snippet;
}

export function activate(context: vscode.ExtensionContext) {
  extensionUri = context.extensionUri;

  // Create status bar
  statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  // Listen for settings changes
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration('sentryClip')) {
        refreshConfig();
      }
    }
  );
  context.subscriptions.push(configChangeListener);

  // Show clipboard history via Webview UI
  const showHistory = vscode.commands.registerCommand(
    'sentry-clip.showHistory',
    async () => {
      try {
        const mgr = getHistoryManager();
        if (webviewManager) {
          webviewManager.show();
        } else {
          // Fallback to Quick Pick if webview is not available
          const allClips = mgr.getClips();
          const pinnedClips = mgr.getPinnedClips();

          const pinnedMap = new Map(pinnedClips.map((c) => [c.id, c]));
          const unpinnedClips = allClips.filter((c) => !pinnedMap.has(c.id));
          const combined = [...pinnedClips, ...unpinnedClips];

          if (combined.length === 0) {
            vscode.window.showInformationMessage('No clipboard history.');
            return;
          }

          const items = combined.map((clip) => ({
            label:
              clip.content.length > 80
                ? clip.content.substring(0, 80) + '…'
                : clip.content,
            description: clip.pinned ? '📌 pinned' : '',
            detail: mgr.getRelativeTime(clip.createdAt),
            clip,
          }));

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a clipboard item',
            matchOnDetail: true,
            matchOnDescription: true,
            ignoreFocusOut: true,
          });

          if (selected) {
            await vscode.env.clipboard.writeText(selected.clip.content);
            vscode.window.showInformationMessage(
              `Copied: ${selected.clip.content.substring(0, 50)}${selected.clip.content.length > 50 ? '…' : ''}`
            );
          }
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Sentry Clip error: ${err}`);
      }
    }
  );
  context.subscriptions.push(showHistory);

  // Copy selected clip to clipboard (Quick Pick fallback)
  const copyClip = vscode.commands.registerCommand(
    'sentry-clip.copy',
    async () => {
      try {
        const mgr = getHistoryManager();
        const clips = mgr.getClips({ limit: 50 });

        if (clips.length === 0) {
          vscode.window.showInformationMessage('No clips to copy.');
          return;
        }

        const items = clips.map((clip) => ({
          label:
            clip.content.length > 80
              ? clip.content.substring(0, 80) + '…'
              : clip.content,
          description: clip.pinned ? '📌 pinned' : '',
          detail: mgr.getRelativeTime(clip.createdAt),
          clip,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a clip to copy',
          matchOnDetail: true,
          matchOnDescription: true,
          ignoreFocusOut: true,
        });

        if (selected) {
          await vscode.env.clipboard.writeText(selected.clip.content);
          vscode.window.showInformationMessage('Copied to clipboard.');
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Sentry Clip error: ${err}`);
      }
    }
  );
  context.subscriptions.push(copyClip);

  // Pin/unpin a clip (Quick Pick fallback)
  const pinClip = vscode.commands.registerCommand(
    'sentry-clip.pin',
    async () => {
      try {
        const mgr = getHistoryManager();
        const clips = mgr.getClips({ limit: 50 });

        if (clips.length === 0) {
          vscode.window.showInformationMessage('No clips to pin.');
          return;
        }

        const items = clips.map((clip) => ({
          label:
            clip.content.length > 80
              ? clip.content.substring(0, 80) + '…'
              : clip.content,
          description: clip.pinned ? '📌 pinned' : 'not pinned',
          detail: mgr.getRelativeTime(clip.createdAt),
          clip,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a clip to pin/unpin',
          matchOnDetail: true,
          matchOnDescription: true,
          ignoreFocusOut: true,
        });

        if (selected) {
          mgr.togglePin(selected.clip.id);
          updateStatusBar();
          webviewManager?.update();
          vscode.window.showInformationMessage(
            selected.clip.pinned
              ? `Unpinned: ${selected.clip.content.substring(0, 50)}${selected.clip.content.length > 50 ? '…' : ''}`
              : `Pinned: ${selected.clip.content.substring(0, 50)}${selected.clip.content.length > 50 ? '…' : ''}`
          );
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Sentry Clip error: ${err}`);
      }
    }
  );
  context.subscriptions.push(pinClip);

  // Search clips (Quick Pick fallback)
  const searchClips = vscode.commands.registerCommand(
    'sentry-clip.search',
    async () => {
      try {
        const mgr = getHistoryManager();
        const query = await vscode.window.showInputBox({
          placeHolder: 'Search clipboard history...',
          ignoreFocusOut: true,
        });

        if (!query || query.trim() === '') {
          return;
        }

        const results = mgr.searchClips(query);

        if (results.length === 0) {
          vscode.window.showInformationMessage('No matching clips found.');
          return;
        }

        const items = results.map((clip) => ({
          label:
            clip.content.length > 80
              ? clip.content.substring(0, 80) + '…'
              : clip.content,
          description: clip.pinned ? '📌 pinned' : '',
          detail: mgr.getRelativeTime(clip.createdAt),
          clip,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `Found ${results.length} result(s)`,
          matchOnDetail: true,
          matchOnDescription: true,
          ignoreFocusOut: true,
        });

        if (selected) {
          await vscode.env.clipboard.writeText(selected.clip.content);
          vscode.window.showInformationMessage('Copied to clipboard.');
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Sentry Clip error: ${err}`);
      }
    }
  );
  context.subscriptions.push(searchClips);

  // Show snippets (Quick Pick fallback)
  const showSnippets = vscode.commands.registerCommand(
    'sentry-clip.showSnippets',
    async () => {
      try {
        const mgr = getHistoryManager();
        const snippets = mgr.getAllSnippets();

        if (snippets.length === 0) {
          vscode.window.showInformationMessage('No snippets defined.');
          return;
        }

        const items = snippets.map((snippet) => ({
          label: snippet.name,
          description:
            snippet.content.length > 60
              ? snippet.content.substring(0, 60) + '…'
              : snippet.content,
          detail: snippet.placeholders.length > 0
            ? `Placeholders: ${snippet.placeholders.join(', ')}`
            : 'No placeholders',
          snippet,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a snippet',
          matchOnDetail: true,
          matchOnDescription: true,
          ignoreFocusOut: true,
        });

        if (selected && snippetEngine) {
          const resolved = snippetEngine.resolvePlaceholders(selected.snippet);
          await vscode.env.clipboard.writeText(resolved);
          vscode.window.showInformationMessage('Snippet copied to clipboard.');
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Sentry Clip error: ${err}`);
      }
    }
  );
  context.subscriptions.push(showSnippets);

  // Copy current editor selection
  const copySelection = vscode.commands.registerCommand(
    'sentry-clip.copySelection',
    async () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage('No active editor.');
          return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
          vscode.window.showInformationMessage('No text selected.');
          return;
        }

        const text = editor.document.getText(selection);
        if (!text.trim()) {
          vscode.window.showInformationMessage('Selected text is empty.');
          return;
        }

        const mgr = getHistoryManager();
        const clip = mgr.addClip(text);

        if (clip.id) {
          updateStatusBar();
          webviewManager?.update();
          await vscode.env.clipboard.writeText(clip.content);
          vscode.window.showInformationMessage(
            `Copied and saved: ${clip.content.substring(0, 50)}${clip.content.length > 50 ? '…' : ''}`
          );
        } else {
          vscode.window.showInformationMessage('Content was excluded or empty.');
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Sentry Clip error: ${err}`);
      }
    }
  );
  context.subscriptions.push(copySelection);

  // Get stats
  const showStats = vscode.commands.registerCommand(
    'sentry-clip.stats',
    async () => {
      try {
        const mgr = getHistoryManager();
        const stats = mgr.getStats();
        vscode.window.showInformationMessage(
          `Sentry Clip Stats:\nTotal clips: ${stats.totalClips}\nPinned: ${stats.pinnedClips}\nSnippets: ${stats.totalSnippets}\nMask rules: ${stats.totalMaskRules}`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Sentry Clip error: ${err}`);
      }
    }
  );
  context.subscriptions.push(showStats);

  // Clear history
  const clearHistory = vscode.commands.registerCommand(
    'sentry-clip.clearHistory',
    async () => {
      try {
        const confirmed = await vscode.window.showWarningMessage(
          'Are you sure you want to clear all clipboard history?',
          { modal: true },
          'Yes, clear all'
        );

        if (confirmed === 'Yes, clear all') {
          const mgr = getHistoryManager();
          const count = mgr.clearHistory();
          vscode.window.showInformationMessage(
            `Cleared ${count} clips from history.`
          );
          updateStatusBar();
          if (webviewManager) {
            webviewManager.update();
          }
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Sentry Clip error: ${err}`);
      }
    }
  );
  context.subscriptions.push(clearHistory);

  // ── Quick Pick flow (Ctrl+Shift+V) ─────────────────────────────────────────
  // Shows a Quick Pick with all clips for fast selection and copy.
  const quickPickClips = vscode.commands.registerCommand(
    'sentry-clip.quickPick',
    async () => {
      try {
        const mgr = getHistoryManager();
        const allClips = mgr.getClips();

        if (allClips.length === 0) {
          vscode.window.showInformationMessage('No clips in history.');
          return;
        }

        // Build a combined list: pinned first, then unpinned
        const pinnedMap = new Map(
          allClips.filter((c) => c.pinned).map((c) => [c.id, c])
        );
        const unpinnedClips = allClips.filter((c) => !pinnedMap.has(c.id));
        const combined = [
          ...allClips.filter((c) => c.pinned),
          ...unpinnedClips,
        ];

        const items = combined.map((clip) => ({
          label:
            clip.content.length > 100
              ? clip.content.substring(0, 100) + '…'
              : clip.content,
          description: clip.pinned ? '📌 pinned' : '',
          detail: mgr.getRelativeTime(clip.createdAt),
          clip,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a clipboard item (Ctrl+Shift+V)',
          matchOnDetail: true,
          matchOnDescription: true,
          ignoreFocusOut: true,
        });

        if (selected) {
          await vscode.env.clipboard.writeText(selected.clip.content);
          vscode.window.showInformationMessage(
            `Copied: ${selected.clip.content.substring(0, 60)}${selected.clip.content.length > 60 ? '…' : ''}`
          );
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Sentry Clip error: ${err}`);
      }
    }
  );
  context.subscriptions.push(quickPickClips);

  // ── Global Hotkey ──────────────────────────────────────────────────────────
  // A command that can be bound to a system-wide hotkey (when: "true").
  // Opens the same Quick Pick flow regardless of editor focus.
  const globalHotkey = vscode.commands.registerCommand(
    'sentry-clip.globalHotkey',
    async () => {
      try {
        const mgr = getHistoryManager();
        const allClips = mgr.getClips();

        if (allClips.length === 0) {
          vscode.window.showInformationMessage('No clips in history.');
          return;
        }

        const pinnedMap = new Map(
          allClips.filter((c) => c.pinned).map((c) => [c.id, c])
        );
        const unpinnedClips = allClips.filter((c) => !pinnedMap.has(c.id));
        const combined = [
          ...allClips.filter((c) => c.pinned),
          ...unpinnedClips,
        ];

        const items = combined.map((clip) => ({
          label:
            clip.content.length > 100
              ? clip.content.substring(0, 100) + '…'
              : clip.content,
          description: clip.pinned ? '📌 pinned' : '',
          detail: mgr.getRelativeTime(clip.createdAt),
          clip,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a clipboard item (Global Hotkey)',
          matchOnDetail: true,
          matchOnDescription: true,
          ignoreFocusOut: true,
        });

        if (selected) {
          await vscode.env.clipboard.writeText(selected.clip.content);
          vscode.window.showInformationMessage(
            `Copied: ${selected.clip.content.substring(0, 60)}${selected.clip.content.length > 60 ? '…' : ''}`
          );
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Sentry Clip error: ${err}`);
      }
    }
  );
  context.subscriptions.push(globalHotkey);
}

export function deactivate() {
  if (statusBarInterval) {
    clearInterval(statusBarInterval);
    statusBarInterval = undefined;
  }
  if (statusBar) {
    statusBar.dispose();
    statusBar = undefined;
  }
  if (webviewManager) {
    webviewManager.dispose();
    webviewManager = undefined;
  }
  if (historyManager) {
    historyManager.close();
    historyManager = undefined;
  }
}
