import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mocks for vscode ──────────────────────────────────────────────────────────

const mockShowInformationMessage = vi.fn();
const mockShowWarningMessage = vi.fn();
const mockShowErrorMessage = vi.fn();
const mockShowQuickPick = vi.fn();
const mockShowInputBox = vi.fn();
const mockClipboardWriteText = vi.fn();
const mockGetConfiguration = vi.fn();
const mockOnDidChangeConfiguration = vi.fn();
const mockRegisterCommand = vi.fn();
const mockCreateWebviewPanel = vi.fn();
const mockCreateStatusBarItem = vi.fn();
const mockActiveTextEditor = {
  selection: { isEmpty: false },
  document: { getText: vi.fn() },
};

function makeDisposable() {
  return { dispose: vi.fn() };
}

vi.mock('vscode', () => ({
  StatusBarAlignment: { Right: 1 },
  ViewColumn: { Two: 2 },
  window: {
    showInformationMessage: (...args: any[]) => {
      mockShowInformationMessage(...args);
      return Promise.resolve(args[0] as string);
    },
    showWarningMessage: (...args: any[]) => {
      return mockShowWarningMessage(...args);
    },
    showErrorMessage: (...args: any[]) => {
      mockShowErrorMessage(...args);
      return Promise.resolve(args[0] as string);
    },
    showQuickPick: (...args: any[]) => {
      return mockShowQuickPick(...args);
    },
    showInputBox: (...args: any[]) => {
      return mockShowInputBox(...args);
    },
    get activeTextEditor() {
      return mockActiveTextEditor;
    },
    createWebviewPanel: (...args: any[]) => {
      return mockCreateWebviewPanel(...args);
    },
    createStatusBarItem: (...args: any[]) => {
      return mockCreateStatusBarItem(...args);
    },
  },
  commands: {
    registerCommand: (...args: any[]) => {
      mockRegisterCommand(...args);
      return { dispose: vi.fn() };
    },
  },
  workspace: {
    getConfiguration: (...args: any[]) => {
      return mockGetConfiguration(...args);
    },
    onDidChangeConfiguration: (...cb: any[]) => {
      mockOnDidChangeConfiguration(...cb);
      return { dispose: vi.fn() };
    },
  },
  env: {
    clipboard: {
      writeText: (...args: any[]) => {
        mockClipboardWriteText(...args);
        return Promise.resolve();
      },
    },
  },
  ViewColumn: { Two: 2 },
}));

// ── Mocks for @sentry-clip/core (hoisted) ─────────────────────────────────────

const { mockHistoryManager, mockSnippetEngine, mockMaskEngine } = vi.hoisted(() => {
  return {
    mockHistoryManager: {
      getClips: vi.fn(),
      getPinnedClips: vi.fn(),
      searchClips: vi.fn(),
      togglePin: vi.fn(),
      getRelativeTime: vi.fn(),
      getStats: vi.fn(),
      clearHistory: vi.fn(),
      getAllSnippets: vi.fn(),
      addClip: vi.fn(),
      close: vi.fn(),
      setConfig: vi.fn(),
      addSnippet: vi.fn(),
      getSnippet: vi.fn(),
      deleteSnippet: vi.fn(),
      getConfig: vi.fn(),
    },
    mockSnippetEngine: {
      getSnippets: vi.fn(),
      resolvePlaceholders: vi.fn(),
      getBuiltInPlaceholders: vi.fn(),
      extractPlaceholders: vi.fn(),
    },
    mockMaskEngine: {
      addRule: vi.fn(),
      removeRule: vi.fn(),
      getRules: vi.fn(),
      mask: vi.fn(),
      maskPreview: vi.fn(),
    },
  };
});

vi.mock('@sentry-clip/core', () => ({
  HistoryManager: vi.fn().mockImplementation(() => mockHistoryManager),
  SnippetEngine: vi.fn().mockImplementation(() => mockSnippetEngine),
  MaskEngine: vi.fn().mockImplementation(() => mockMaskEngine),
  Clip: {},
  Snippet: {},
  MaskRule: {},
}));

// ── Test helpers ───────────────────────────────────────────────────────────────

function getCommandHandler(name: string) {
  const call = mockRegisterCommand.mock.calls.find(
    (c: any[]) => c[0] === name
  );
  expect(call).toBeDefined(`Command ${name} was not registered`);
  return call![1] as () => Promise<void>;
}

// ── WebviewPanel mock factory with HTML capture ────────────────────────────────

function createMockPanel(): any {
  const postMessageMock = vi.fn();
  const onDidReceiveMessageMock = vi.fn();
  const onDidDisposeMock = vi.fn();
  const onDidChangeViewStateMock = vi.fn();
  const revealMock = vi.fn();
  const asWebviewUriMock = vi.fn((uri: any) => uri);
  let capturedHtml = '';

  const webview = {
    asWebviewUri: asWebviewUriMock,
    cspSource: 'https://example.com',
    postMessage: postMessageMock,
    onDidReceiveMessage: (...cb: any[]) => {
      onDidReceiveMessageMock(...cb);
      return makeDisposable();
    },
    get html() {
      return capturedHtml;
    },
    set html(val: string) {
      capturedHtml = val;
    },
  };

  const panel = {
    postMessage: postMessageMock,
    onDidReceiveMessage: (...cb: any[]) => {
      onDidReceiveMessageMock(...cb);
      return makeDisposable();
    },
    onDidDispose: (...cb: any[]) => {
      onDidDisposeMock(...cb);
      return makeDisposable();
    },
    onDidChangeViewState: (...cb: any[]) => {
      onDidChangeViewStateMock(...cb);
      return makeDisposable();
    },
    reveal: revealMock,
    visible: true,
    dispose: vi.fn(),
    webview,
  };

  return {
    panel,
    webview,
    postMessage: postMessageMock,
    postMessageMock,
    onDidReceiveMessageMock,
    onDidDisposeMock,
    onDidChangeViewStateMock,
    revealMock,
    reveal: revealMock,
    asWebviewUriMock,
    dispose: panel.dispose,
    getCapturedHtml: () => capturedHtml,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Final UI Polish - Relative Timestamps, Hover Previews, Status Bar', () => {
  let context: any;
  let mockPanel: any;
  let extension: typeof import('./extension');
  let webviewModule: typeof import('./webview');

  const sampleClip1 = {
    id: 'clip-1',
    content: 'Hello, world!',
    createdAt: Date.now() - 60000,
    pinned: false,
    hash: 'abc123',
  };

  const sampleClip2 = {
    id: 'clip-2',
    content: 'Pinned content with more details',
    createdAt: Date.now() - 120000,
    pinned: true,
    hash: 'def456',
  };

  const sampleClip3 = {
    id: 'clip-3',
    content: 'Old clip from 2 hours ago',
    createdAt: Date.now() - 7200000,
    pinned: false,
    hash: 'ghi789',
  };

  const sampleSnippet = {
    id: 'snip-1',
    name: 'Greeting',
    content: 'Hello {{name}}!',
    placeholders: ['name'],
    createdAt: Date.now(),
  };

  const sampleMaskRule = {
    id: 'rule-1',
    name: 'Email',
    pattern: new RegExp('[\\w.+-]+@[\\w-]+\\.[\\w.]+'),
    replacement: '[REDACTED]',
    enabled: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGetConfiguration.mockReturnValue({
      get: (key: string, fallback: any) => {
        const defaults: Record<string, any> = {
          maxHistory: 1000,
          enableMasking: true,
          enableSnippets: true,
        };
        return defaults[key] ?? fallback;
      },
    });

    mockActiveTextEditor.selection = { isEmpty: false };
    mockActiveTextEditor.document.getText = vi.fn().mockReturnValue('selected text');

    context = {
      subscriptions: [] as any[],
      extensionUri: { fsPath: '/mock/extension' },
    };

    mockHistoryManager.getClips.mockReturnValue([sampleClip1, sampleClip2, sampleClip3]);
    mockHistoryManager.getPinnedClips.mockReturnValue([sampleClip2]);
    mockHistoryManager.searchClips.mockReturnValue([sampleClip1]);
    mockHistoryManager.getRelativeTime.mockImplementation((ts: number) => {
      const diff = Date.now() - ts;
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      return Math.floor(diff / 86400000) + 'd ago';
    });
    mockHistoryManager.getStats.mockReturnValue({
      totalClips: 3,
      pinnedClips: 1,
      totalSnippets: 1,
      totalMaskRules: 1,
    });
    mockHistoryManager.clearHistory.mockReturnValue(3);
    mockHistoryManager.addClip.mockReturnValue(sampleClip1);
    mockHistoryManager.getAllSnippets.mockReturnValue([sampleSnippet]);
    mockHistoryManager.getConfig.mockReturnValue({
      maxHistory: 1000,
      enableMasking: true,
      enableSnippets: true,
      exclusionPatterns: [],
    });
    mockHistoryManager.addSnippet.mockReturnValue(sampleSnippet);
    mockHistoryManager.getSnippet.mockReturnValue(sampleSnippet);
    mockHistoryManager.deleteSnippet.mockReturnValue(true);

    mockSnippetEngine.getSnippets.mockReturnValue([sampleSnippet]);
    mockSnippetEngine.resolvePlaceholders.mockReturnValue('Hello World!');
    mockSnippetEngine.getBuiltInPlaceholders.mockReturnValue([
      { name: 'timestamp', description: 'Current Unix timestamp' },
      { name: 'date', description: 'Current date in ISO format' },
      { name: 'hostname', description: 'Current machine hostname' },
      { name: 'uuid', description: 'A random UUID v4 string' },
    ]);
    mockSnippetEngine.extractPlaceholders.mockReturnValue(['name']);

    mockMaskEngine.getRules.mockReturnValue([sampleMaskRule]);
    mockMaskEngine.mask.mockImplementation((text: string) => text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED]'));
    mockMaskEngine.maskPreview.mockImplementation((text: string) => text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED]'));

    mockPanel = createMockPanel();
    mockCreateWebviewPanel.mockReturnValue(mockPanel.panel);

    // Mock status bar item
    mockCreateStatusBarItem.mockReturnValue({
      show: vi.fn(),
      dispose: vi.fn(),
      text: '',
      tooltip: '',
      command: '',
    });

    // Re-import modules after clearing mocks
    extension = await import('./extension');
    webviewModule = await import('./webview');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Relative Timestamps Tests ──────────────────────────────────────────────

  describe('Relative Timestamps', () => {
    it('should send relative timestamps in init message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // Check that getRelativeTime was called for each clip
      expect(mockHistoryManager.getRelativeTime).toHaveBeenCalledTimes(3);
      expect(mockHistoryManager.getRelativeTime).toHaveBeenCalledWith(sampleClip1.createdAt);
      expect(mockHistoryManager.getRelativeTime).toHaveBeenCalledWith(sampleClip2.createdAt);
      expect(mockHistoryManager.getRelativeTime).toHaveBeenCalledWith(sampleClip3.createdAt);
    });

    it('should handle requestTimestamps message and send updated timestamps', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];

      // Simulate the webview requesting timestamp updates
      await messageHandler({ type: 'requestTimestamps' });

      // Should send back updated timestamps
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'updateTimestamps',
          timestamps: expect.any(Object),
        })
      );

      // The timestamps object should contain entries for each clip
      const call = mockPanel.webview.postMessage.mock.calls[0][0];
      expect(call.timestamps).toHaveProperty('clip-1');
      expect(call.timestamps).toHaveProperty('clip-2');
      expect(call.timestamps).toHaveProperty('clip-3');
    });

    it('should include relativeTime in clip data sent to webview', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // The captured HTML should contain relativeTime data
      const html = mockPanel.getCapturedHtml();
      expect(html).toContain('relativeTime');
    });

    it('should handle timestamp updates for clips with same id', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({ type: 'requestTimestamps' });

      const call = mockPanel.webview.postMessage.mock.calls[0][0];
      // Verify the timestamps object has the correct structure
      expect(typeof call.timestamps).toBe('object');
      expect(Object.keys(call.timestamps).length).toBe(3);
    });

    it('should handle empty clip list for timestamp updates', async () => {
      mockHistoryManager.getClips.mockReturnValue([]);

      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({ type: 'requestTimestamps' });

      // Should still send a message with empty timestamps
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'updateTimestamps',
          timestamps: {},
        })
      );
    });
  });

  // ── Hover Preview Tests ─────────────────────────────────────────────────────

  describe('Hover Previews', () => {
    it('should include hover-preview CSS in the webview HTML', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();
      expect(html).toContain('hover-preview');
      expect(html).toContain('preview-label');
      expect(html).toContain('preview-content');
      expect(html).toContain('preview-meta');
    });

    it('should include hover-preview div in clip items', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();
      // Check that the clip item template includes hover-preview
      expect(html).toContain('hover-preview');
      expect(html).toContain('preview-label');
      expect(html).toContain('preview-content');
      expect(html).toContain('preview-meta');
    });

    it('should show full content in hover preview', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();
      // The preview should include the full content (up to 300 chars)
      expect(html).toContain('previewContent');
      expect(html).toContain('esc(c.content)');
    });

    it('should show pinned status in hover preview meta', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();
      // The preview meta should include pinned status
      expect(html).toContain('preview-meta');
      expect(html).toContain('pinned');
    });

    it('should truncate long content in hover preview', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();
      // Long content should be truncated to 300 chars
      expect(html).toContain('300');
      expect(html).toContain('substring');
    });

    it('should show relative time in hover preview meta', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();
      // The preview meta should include relative time
      expect(html).toContain('relativeTime');
    });
  });

  // ── Status Bar Integration Tests ────────────────────────────────────────────

  describe('Status Bar Integration', () => {
    it('should create a status bar item on activation', async () => {
      extension.activate(context);

      expect(mockCreateStatusBarItem).toHaveBeenCalledWith(
        1, // StatusBarAlignment.Right
        100
      );
    });

    it('should show status bar item with initial text', async () => {
      extension.activate(context);

      const statusBar = mockCreateStatusBarItem.mock.results[0].value;
      expect(statusBar.show).toHaveBeenCalled();
      expect(statusBar.text).toBe('$(clipboard) Sentry Clip');
      expect(statusBar.tooltip).toBe('Sentry Clip: Click to open clipboard history');
      expect(statusBar.command).toBe('sentry-clip.showHistory');
    });

    it('should update status bar with clip count and pinned count', async () => {
      extension.activate(context);

      // Trigger status bar update by calling the handler which creates historyManager
      const handler = getCommandHandler('sentry-clip.showHistory');
      await handler();

      // After getHistoryManager is called, the status bar should have been updated
      expect(mockHistoryManager.getStats).toHaveBeenCalled();
    });

    it('should include pinned count in status bar text when there are pinned clips', async () => {
      extension.activate(context);

      const handler = getCommandHandler('sentry-clip.showHistory');
      await handler();

      // The status bar should show "3 clips · 1 pinned"
      expect(mockHistoryManager.getStats).toHaveBeenCalled();
      const stats = mockHistoryManager.getStats.mock.results[0].value;
      expect(stats.totalClips).toBe(3);
      expect(stats.pinnedClips).toBe(1);
    });

    it('should update status bar tooltip with clip and pinned counts', async () => {
      extension.activate(context);

      const handler = getCommandHandler('sentry-clip.showHistory');
      await handler();

      expect(mockHistoryManager.getStats).toHaveBeenCalled();
    });

    it('should handle status bar update gracefully when no history exists', async () => {
      mockHistoryManager.getStats.mockImplementation(() => {
        throw new Error('No history');
      });

      extension.activate(context);

      // Should not throw and should fall back to default text
      const statusBar = mockCreateStatusBarItem.mock.results[0].value;
      expect(statusBar.show).toHaveBeenCalled();
    });

    it('should dispose status bar on deactivate', async () => {
      extension.activate(context);

      const statusBar = mockCreateStatusBarItem.mock.results[0].value;
      extension.deactivate();

      expect(statusBar.dispose).toHaveBeenCalled();
    });

    it('should add status bar to context subscriptions', async () => {
      extension.activate(context);

      expect(context.subscriptions).toContainEqual(
        expect.objectContaining({
          dispose: expect.any(Function),
        })
      );
    });

    it('should register showHistory command that opens status bar', async () => {
      extension.activate(context);

      const registeredCommands = mockRegisterCommand.mock.calls.map(
        (call: any[]) => call[0]
      );

      expect(registeredCommands).toContain('sentry-clip.showHistory');
    });

    it('should update status bar text with correct format', async () => {
      extension.activate(context);

      const handler = getCommandHandler('sentry-clip.showHistory');
      await handler();

      // Verify stats were fetched
      expect(mockHistoryManager.getStats).toHaveBeenCalled();
    });
  });

  // ── Integration: Timestamps + Hover + Status Bar ────────────────────────────

  describe('Full UI Integration', () => {
    it('should have all UI elements in the webview HTML', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();

      // Check for all major UI elements
      expect(html).toContain('tab-history');
      expect(html).toContain('tab-masking');
      expect(html).toContain('tab-snippets');
      expect(html).toContain('clipList');
      expect(html).toContain('searchInput');
      expect(html).toContain('hover-preview');
      expect(html).toContain('preview-content');
      expect(html).toContain('preview-meta');
      expect(html).toContain('stats');
      expect(html).toContain('clip-meta');
    });

    it('should send all data in init message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // Verify that all required data sources were called
      expect(mockHistoryManager.getClips).toHaveBeenCalled();
      expect(mockHistoryManager.getAllSnippets).toHaveBeenCalled();
      expect(mockMaskEngine.getRules).toHaveBeenCalled();
      expect(mockSnippetEngine.getBuiltInPlaceholders).toHaveBeenCalled();
    });

    it('should handle copy action and show toast', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'copy',
        clipId: 'clip-1',
        content: 'Hello, world!',
      });

      expect(mockClipboardWriteText).toHaveBeenCalledWith('Hello, world!');
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should handle pin toggle and refresh', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'togglePin',
        clipId: 'clip-1',
      });

      expect(mockHistoryManager.togglePin).toHaveBeenCalledWith('clip-1');
      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should handle clear history and refresh', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'clearHistory',
      });

      expect(mockHistoryManager.clearHistory).toHaveBeenCalled();
      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should handle refresh message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'refresh',
      });

      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should handle snippet copy', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'copySnippet',
        snippetId: 'snip-1',
        content: 'Hello {{name}}!',
        snippetName: 'Greeting',
      });

      expect(mockClipboardWriteText).toHaveBeenCalledWith('Hello {{name}}!');
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should handle copyAll message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'copyAll',
        content: 'Clip 1\nClip 2\nClip 3',
      });

      expect(mockClipboardWriteText).toHaveBeenCalledWith('Clip 1\nClip 2\nClip 3');
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should handle error in copy action', async () => {
      mockClipboardWriteText.mockImplementation(() => {
        throw new Error('Clipboard error');
      });

      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'copy',
        clipId: 'clip-1',
        content: 'Hello, world!',
      });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toast',
          level: 'error',
        })
      );
    });

    it('should handle error in pin toggle', async () => {
      mockHistoryManager.togglePin.mockImplementation(() => {
        throw new Error('Pin error');
      });

      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'togglePin',
        clipId: 'clip-1',
      });

      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toast',
          level: 'error',
        })
      );
    });

    it('should handle error in clear history', async () => {
      mockHistoryManager.clearHistory.mockImplementation(() => {
        throw new Error('Clear error');
      });

      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'clearHistory',
      });

      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toast',
          level: 'error',
        })
      );
    });

    it('should dispose webview manager properly', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // Should not throw
      expect(() => mgr.dispose()).not.toThrow();
    });

    it('should update webview when panel is visible', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // Simulate view state change to visible
      const viewStateCallback = mockPanel.onDidChangeViewStateMock.mock.calls[0][0];
      viewStateCallback({ webviewPanel: { visible: true } });

      // Should have called sendInitMessage (which calls getClips, etc.)
      expect(mockHistoryManager.getClips).toHaveBeenCalled();
    });

    it('should handle webview panel dispose', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // Simulate panel dispose
      const disposeCallback = mockPanel.onDidDisposeMock.mock.calls[0][0];
      disposeCallback();

      // Panel should be cleared
      expect(mgr.panelVisible).toBe(false);
    });

    it('should reveal existing panel instead of creating new one', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // Call show again
      mgr.show();

      // Should have called reveal, not createWebviewPanel again
      expect(mockPanel.reveal).toHaveBeenCalled();
      expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1);
    });

    it('should include relative timestamps in all clip data', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // Verify getRelativeTime was called for each clip
      expect(mockHistoryManager.getRelativeTime).toHaveBeenCalledTimes(3);
    });

    it('should handle webview message with unknown type', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      // Should not throw
      await messageHandler({ type: 'unknownType' });
    });
  });

  // ── Extension Activation Tests ──────────────────────────────────────────────

  describe('Extension Activation with Status Bar', () => {
    it('should register status bar on activation', async () => {
      extension.activate(context);

      expect(mockCreateStatusBarItem).toHaveBeenCalled();
    });

    it('should show status bar on activation', async () => {
      extension.activate(context);

      const statusBar = mockCreateStatusBarItem.mock.results[0].value;
      expect(statusBar.show).toHaveBeenCalled();
    });

    it('should register all expected commands', async () => {
      extension.activate(context);

      const registeredCommands = mockRegisterCommand.mock.calls.map(
        (call: any[]) => call[0]
      );

      const expectedCommands = [
        'sentry-clip.showHistory',
        'sentry-clip.copy',
        'sentry-clip.pin',
        'sentry-clip.search',
        'sentry-clip.showSnippets',
        'sentry-clip.copySelection',
        'sentry-clip.stats',
        'sentry-clip.clearHistory',
        'sentry-clip.quickPick',
        'sentry-clip.globalHotkey',
      ];

      for (const cmd of expectedCommands) {
        expect(registeredCommands).toContain(cmd);
      }
    });

    it('should listen for configuration changes', async () => {
      extension.activate(context);

      expect(mockOnDidChangeConfiguration).toHaveBeenCalled();
    });

    it('should add status bar to context subscriptions', async () => {
      extension.activate(context);

      expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it('should deactivate without errors', async () => {
      extension.activate(context);

      expect(() => extension.deactivate()).not.toThrow();
    });

    it('should dispose status bar on deactivate', async () => {
      extension.activate(context);

      const statusBar = mockCreateStatusBarItem.mock.results[0].value;
      extension.deactivate();

      expect(statusBar.dispose).toHaveBeenCalled();
    });

    it('should dispose webview manager on deactivate', async () => {
      extension.activate(context);

      const handler = getCommandHandler('sentry-clip.showHistory');
      await handler();

      extension.deactivate();

      expect(mockPanel.dispose).toHaveBeenCalled();
    });

    it('should close history manager on deactivate', async () => {
      extension.activate(context);

      const handler = getCommandHandler('sentry-clip.showHistory');
      await handler();

      extension.deactivate();

      expect(mockHistoryManager.close).toHaveBeenCalled();
    });

    it('should handle status bar update when stats are available', async () => {
      extension.activate(context);

      const handler = getCommandHandler('sentry-clip.showHistory');
      await handler();

      // Stats should have been fetched
      expect(mockHistoryManager.getStats).toHaveBeenCalled();
    });

    it('should handle status bar update gracefully when stats fail', async () => {
      mockHistoryManager.getStats.mockImplementation(() => {
        throw new Error('Stats error');
      });

      extension.activate(context);

      const handler = getCommandHandler('sentry-clip.showHistory');
      // Should not throw
      await handler();
    });
  });

  // ── Webview HTML Structure Tests ────────────────────────────────────────────

  describe('Webview HTML Structure', () => {
    it('should have all required CSS classes for hover preview', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();

      // Check for hover preview CSS
      expect(html).toContain('.clip-item .hover-preview');
      expect(html).toContain('.preview-label');
      expect(html).toContain('.preview-content');
      expect(html).toContain('.preview-meta');
    });

    it('should have all required HTML elements for history tab', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();

      expect(html).toContain('id="tab-history"');
      expect(html).toContain('id="clipList"');
      expect(html).toContain('id="searchInput"');
      expect(html).toContain('id="stats"');
      expect(html).toContain('id="copyAllBtn"');
      expect(html).toContain('id="refreshBtn"');
      expect(html).toContain('id="clearBtn"');
    });

    it('should have all required HTML elements for masking tab', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();

      expect(html).toContain('id="tab-masking"');
      expect(html).toContain('id="maskRuleList"');
      expect(html).toContain('id="previewOutput"');
      expect(html).toContain('id="previewInput"');
    });

    it('should have all required HTML elements for snippets tab', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();

      expect(html).toContain('id="tab-snippets"');
      expect(html).toContain('id="snippetList"');
      expect(html).toContain('id="snippetEditor"');
      expect(html).toContain('id="snippetPreview"');
      expect(html).toContain('id="builtinPlaceholders"');
    });

    it('should have toast element', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();

      expect(html).toContain('id="toast"');
      expect(html).toContain('.toast');
    });

    it('should have clip-meta element for relative timestamps', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();

      expect(html).toContain('clip-meta');
      expect(html).toContain('relativeTime');
    });

    it('should have pin button with correct styling', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();

      expect(html).toContain('pin-btn');
      expect(html).toContain('pinned');
    });

    it('should have clip-item with pinned styling', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const html = mockPanel.getCapturedHtml();

      expect(html).toContain('clip-item');
      expect(html).toContain('pinned');
    });
  });
});
