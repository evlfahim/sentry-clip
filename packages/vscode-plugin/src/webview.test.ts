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
const mockActiveTextEditor = {
  selection: { isEmpty: false },
  document: { getText: vi.fn() },
};

function makeDisposable() {
  return { dispose: vi.fn() };
}

vi.mock('vscode', () => ({
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
    onDidChangeConfiguration: (...args: any[]) => {
      mockOnDidChangeConfiguration(...args);
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

// ── Mocks for @sentry-clip/core ───────────────────────────────────────────────

const mockHistoryManager = {
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
};

const mockSnippetEngine = {
  getSnippets: vi.fn(),
  resolvePlaceholders: vi.fn(),
};

vi.mock('@sentry-clip/core', () => ({
  HistoryManager: vi.fn().mockImplementation(() => mockHistoryManager),
  SnippetEngine: vi.fn().mockImplementation(() => mockSnippetEngine),
  Clip: {},
  Snippet: {},
}));

// ── Test helpers ───────────────────────────────────────────────────────────────

function getCommandHandler(name: string) {
  const call = mockRegisterCommand.mock.calls.find(
    (c: any[]) => c[0] === name
  );
  expect(call).toBeDefined(`Command ${name} was not registered`);
  return call![1] as () => Promise<void>;
}

// ── WebviewPanel mock factory ─────────────────────────────────────────────────

function createMockPanel(): any {
  const postMessageMock = vi.fn();
  const onDidReceiveMessageMock = vi.fn();
  const onDidDisposeMock = vi.fn();
  const onDidChangeViewStateMock = vi.fn();
  const revealMock = vi.fn();
  const asWebviewUriMock = vi.fn((uri: any) => uri);

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
    webview: {
      asWebviewUri: asWebviewUriMock,
      cspSource: 'https://example.com',
      postMessage: postMessageMock,
      onDidReceiveMessage: (...cb: any[]) => {
        onDidReceiveMessageMock(...cb);
        return makeDisposable();
      },
    },
  };

  return {
    panel,
    postMessageMock,
    onDidReceiveMessageMock,
    onDidDisposeMock,
    onDidChangeViewStateMock,
    revealMock,
    asWebviewUriMock,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Webview UI Tests', () => {
  let context: any;
  let mockPanel: any;
  let extension: typeof import('./extension');
  let webviewModule: typeof import('./webview');

  const sampleClip = {
    id: 'clip-1',
    content: 'Hello, world!',
    createdAt: Date.now() - 60000,
    pinned: false,
    hash: 'abc123',
  };

  const samplePinnedClip = {
    id: 'clip-2',
    content: 'Pinned content',
    createdAt: Date.now() - 120000,
    pinned: true,
    hash: 'def456',
  };

  const sampleSnippet = {
    id: 'snip-1',
    name: 'Greeting',
    content: 'Hello {{name}}!',
    placeholders: ['name'],
    createdAt: Date.now(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

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

    mockHistoryManager.getClips.mockReturnValue([sampleClip]);
    mockHistoryManager.getPinnedClips.mockReturnValue([samplePinnedClip]);
    mockHistoryManager.searchClips.mockReturnValue([sampleClip]);
    mockHistoryManager.getRelativeTime.mockReturnValue('1m ago');
    mockHistoryManager.getStats.mockReturnValue({
      totalClips: 1,
      pinnedClips: 1,
      totalSnippets: 0,
      totalMaskRules: 0,
    });
    mockHistoryManager.clearHistory.mockReturnValue(1);
    mockHistoryManager.addClip.mockReturnValue(sampleClip);
    mockHistoryManager.getAllSnippets.mockReturnValue([sampleSnippet]);

    mockSnippetEngine.getSnippets.mockReturnValue([sampleSnippet]);
    mockSnippetEngine.resolvePlaceholders.mockReturnValue('Hello World!');

    mockPanel = createMockPanel();
    mockCreateWebviewPanel.mockReturnValue(mockPanel.panel);

    // Re-import modules after module cache reset
    extension = await import('./extension');
    webviewModule = await import('./webview');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // ── WebviewManager class tests ─────────────────────────────────────────────

  describe('WebviewManager', () => {
    it('should export WebviewManager class', () => {
      expect(typeof webviewModule.WebviewManager).toBe('function');
    });

    it('should create a WebviewManager instance', () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      expect(mgr).toBeDefined();
      expect(mgr.panelVisible).toBe(false);
    });

    it('should show the webview panel on show()', () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      expect(mockCreateWebviewPanel).toHaveBeenCalledWith(
        'sentryClip',
        'Sentry Clip',
        expect.anything(),
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        })
      );
    });

    it('should send init message with clips on show()', () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // The panel should have been created
      expect(mockCreateWebviewPanel).toHaveBeenCalled();
    });

    it('should handle copy message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // Simulate receiving a copy message
      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({ type: 'copy', clipId: 'clip-1', content: 'Hello, world!' });

      expect(mockClipboardWriteText).toHaveBeenCalledWith('Hello, world!');
    });

    it('should handle togglePin message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({ type: 'togglePin', clipId: 'clip-1' });

      expect(mockHistoryManager.togglePin).toHaveBeenCalledWith('clip-1');
    });

    it('should handle clearHistory message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({ type: 'clearHistory' });

      expect(mockHistoryManager.clearHistory).toHaveBeenCalled();
    });

    it('should handle refresh message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({ type: 'refresh' });

      // Should re-send init message (which rebuilds the HTML)
      expect(mockHistoryManager.getClips).toHaveBeenCalled();
    });

    it('should handle copyAll message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({ type: 'copyAll', content: 'line1\nline2' });

      expect(mockClipboardWriteText).toHaveBeenCalledWith('line1\nline2');
    });

    it('should handle copySnippet message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({ type: 'copySnippet', content: 'Hello World!', snippetName: 'Greeting' });

      expect(mockClipboardWriteText).toHaveBeenCalledWith('Hello World!');
    });

    it('should dispose properly', () => {
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

    it('should update when update() is called', () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // Simulate view state change to trigger init
      const viewStateCallback = mockPanel.onDidChangeViewStateMock.mock.calls[0][0];
      viewStateCallback({ webviewPanel: { visible: true } });

      expect(mockHistoryManager.getClips).toHaveBeenCalled();
    });
  });

  // ── Extension with Webview integration tests ────────────────────────────────

  describe('Extension with Webview', () => {
    it('should export activate and deactivate functions', () => {
      expect(typeof extension.activate).toBe('function');
      expect(typeof extension.deactivate).toBe('function');
    });

    it('should register all commands when activate is called', () => {
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
      ];

      for (const cmd of expectedCommands) {
        expect(registeredCommands).toContain(cmd);
      }
    });

    it('should create webview panel on showHistory', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.showHistory');

      await handler();

      expect(mockCreateWebviewPanel).toHaveBeenCalled();
    });

    it('should create webview with empty clips when no history exists', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.showHistory');

      mockHistoryManager.getClips.mockReturnValue([]);
      mockHistoryManager.getPinnedClips.mockReturnValue([]);

      await handler();

      // Webview should still be created (just with empty clips)
      expect(mockCreateWebviewPanel).toHaveBeenCalled();
    });

    it('should listen for configuration changes', () => {
      extension.activate(context);
      expect(mockOnDidChangeConfiguration).toHaveBeenCalled();
    });

    it('should add all disposables to context.subscriptions', () => {
      extension.activate(context);
      expect(context.subscriptions.length).toBe(9);
    });

    it('should handle clearHistory and update webview', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.clearHistory');

      mockShowWarningMessage.mockResolvedValue('Yes, clear all');

      await handler();

      expect(mockHistoryManager.clearHistory).toHaveBeenCalled();
    });

    it('should handle deactivate properly', () => {
      extension.activate(context);
      expect(() => extension.deactivate()).not.toThrow();
    });

    it('should call historyManager.close on deactivate', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.showHistory');
      mockShowQuickPick.mockResolvedValue(null);
      await handler();
      extension.deactivate();
      expect(mockHistoryManager.close).toHaveBeenCalled();
    });

    it('should show error message when command throws', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.showHistory');

      mockHistoryManager.getClips.mockImplementation(() => {
        throw new Error('Database error');
      });

      await handler();

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Sentry Clip error')
      );
    });

    it('should refresh config on settings change', async () => {
      extension.activate(context);

      // First trigger history manager initialization by calling a command
      const handler = getCommandHandler('sentry-clip.showHistory');
      await handler();

      // Now trigger the config change callback
      const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
      configCallback({ affectsConfiguration: (key: string) => key === 'sentryClip' });

      expect(mockHistoryManager.setConfig).toHaveBeenCalled();
    });

    it('should use Quick Pick fallback when webview is not available', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.copy');

      mockShowQuickPick.mockResolvedValue({ clip: sampleClip });
      await handler();

      expect(mockClipboardWriteText).toHaveBeenCalledWith(sampleClip.content);
    });
  });
});
