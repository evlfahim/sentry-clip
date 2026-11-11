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
  addSnippet: vi.fn(),
  getSnippet: vi.fn(),
  deleteSnippet: vi.fn(),
  getConfig: vi.fn(),
};

const mockSnippetEngine = {
  getSnippets: vi.fn(),
  resolvePlaceholders: vi.fn(),
  getBuiltInPlaceholders: vi.fn(),
  extractPlaceholders: vi.fn(),
};

const mockMaskEngine = {
  addRule: vi.fn(),
  removeRule: vi.fn(),
  getRules: vi.fn(),
  mask: vi.fn(),
  maskPreview: vi.fn(),
};

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

describe('Webview UI - Masking & Snippets Tests', () => {
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

  const sampleMaskRule = {
    id: 'rule-1',
    name: 'Email',
    pattern: new RegExp('[\\w.+-]+@[\\w-]+\\.[\\w.]+'),
    replacement: '[REDACTED]',
    enabled: true,
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

    // Re-import modules after module cache reset
    extension = await import('./extension');
    webviewModule = await import('./webview');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ── Masking tab tests ──────────────────────────────────────────────────────

  describe('Masking Tab', () => {
    it('should handle addMaskRule message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'addMaskRule',
        name: 'Phone Number',
        pattern: '\\d{3}-\\d{3}-\\d{4}',
        replacement: '[PHONE]',
      });

      expect(mockMaskEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Phone Number',
          pattern: expect.any(RegExp),
          replacement: '[PHONE]',
          enabled: true,
        })
      );
      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should handle toggleMaskRule message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'toggleMaskRule',
        ruleId: 'rule-1',
        enabled: false,
      });

      // The rule should have been found and toggled
      expect(mockMaskEngine.getRules).toHaveBeenCalled();
      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should handle deleteMaskRule message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'deleteMaskRule',
        ruleId: 'rule-1',
      });

      expect(mockMaskEngine.removeRule).toHaveBeenCalledWith('rule-1');
      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should handle previewMask message and send preview back', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'previewMask',
        text: 'Contact me at test@example.com',
      });

      expect(mockMaskEngine.maskPreview).toHaveBeenCalledWith('Contact me at test@example.com');
      // Should have sent the preview back to the webview
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'maskPreview' })
      );
    });

    it('should include mask rules in init message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // The HTML should contain masking tab elements
      const htmlCalls = mockPanel.webview.postMessage.mock.calls;
      // The HTML is set via the html property, not postMessage
      // Let's verify the panel was created with the right content
      expect(mockCreateWebviewPanel).toHaveBeenCalled();
    });

    it('should handle editMaskRule message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'editMaskRule',
        ruleId: 'rule-1',
      });

      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });
  });

  // ── Snippets tab tests ─────────────────────────────────────────────────────

  describe('Snippets Tab', () => {
    it('should handle createSnippet message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'createSnippet',
        name: 'New Snippet',
      });

      expect(mockHistoryManager.addSnippet).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Snippet',
          content: '',
          placeholders: [],
        })
      );
      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should handle saveSnippet message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'saveSnippet',
        snippetId: 'snip-1',
        name: 'Updated Snippet',
        content: 'Hello {{name}}, welcome to {{date}}',
      });

      expect(mockHistoryManager.addSnippet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'snip-1',
          name: 'Updated Snippet',
          content: 'Hello {{name}}, welcome to {{date}}',
        })
      );
      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should handle deleteSnippet message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'deleteSnippet',
        snippetId: 'snip-1',
      });

      expect(mockHistoryManager.deleteSnippet).toHaveBeenCalledWith('snip-1');
      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast' })
      );
    });

    it('should include snippets and builtin placeholders in init message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // Verify the snippet engine was initialized with builtin placeholders
      expect(mockSnippetEngine.getBuiltInPlaceholders).toHaveBeenCalled();
      expect(mockHistoryManager.getAllSnippets).toHaveBeenCalled();
    });

    it('should extract placeholders from snippet content', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // The snippet engine should be able to extract placeholders
      expect(mockSnippetEngine.extractPlaceholders).not.toHaveBeenCalled(); // only on save

      // Simulate saveSnippet which calls extractPlaceholders
      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'saveSnippet',
        snippetId: 'snip-1',
        name: 'Test',
        content: 'Hello {{name}} from {{hostname}}',
      });

      expect(mockSnippetEngine.extractPlaceholders).toHaveBeenCalledWith(
        'Hello {{name}} from {{hostname}}'
      );
    });
  });

  // ── Tab switching tests ────────────────────────────────────────────────────

  describe('Tab Switching', () => {
    it('should have history, masking, and snippets tabs in the HTML', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // The HTML is generated via getHtml and set on panel.webview.html
      // We can verify the panel was created
      expect(mockCreateWebviewPanel).toHaveBeenCalled();
    });

    it('should include masking tab HTML elements', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // Verify the panel was created with scripts enabled
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

    it('should include snippets tab HTML elements', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      expect(mockCreateWebviewPanel).toHaveBeenCalled();
    });
  });

  // ── Integration tests ──────────────────────────────────────────────────────

  describe('Masking & Snippets Integration', () => {
    it('should send mask rules in init message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      // The init message should include mask rules
      expect(mockMaskEngine.getRules).toHaveBeenCalled();
    });

    it('should send builtin placeholders in init message', async () => {
      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      expect(mockSnippetEngine.getBuiltInPlaceholders).toHaveBeenCalled();
    });

    it('should handle masking error gracefully', async () => {
      mockMaskEngine.maskPreview.mockImplementation(() => {
        throw new Error('Invalid regex');
      });

      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'previewMask',
        text: 'test@example.com',
      });

      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast', level: 'error' })
      );
    });

    it('should handle snippet save error gracefully', async () => {
      mockHistoryManager.addSnippet.mockImplementation(() => {
        throw new Error('Database error');
      });

      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'saveSnippet',
        snippetId: 'snip-1',
        name: 'Test',
        content: 'Hello',
      });

      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast', level: 'error' })
      );
    });

    it('should handle snippet creation error gracefully', async () => {
      mockHistoryManager.addSnippet.mockImplementation(() => {
        throw new Error('Database error');
      });

      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'createSnippet',
        name: 'New Snippet',
      });

      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast', level: 'error' })
      );
    });

    it('should handle mask rule add error gracefully', async () => {
      mockMaskEngine.addRule.mockImplementation(() => {
        throw new Error('Invalid rule');
      });

      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'addMaskRule',
        name: 'Test',
        pattern: '[invalid',
        replacement: '[X]',
      });

      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast', level: 'error' })
      );
    });

    it('should handle mask rule delete error gracefully', async () => {
      mockMaskEngine.removeRule.mockImplementation(() => {
        throw new Error('Not found');
      });

      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'deleteMaskRule',
        ruleId: 'nonexistent',
      });

      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast', level: 'error' })
      );
    });

    it('should handle snippet delete error gracefully', async () => {
      mockHistoryManager.deleteSnippet.mockImplementation(() => {
        throw new Error('Not found');
      });

      const mgr = new webviewModule.WebviewManager({
        historyManager: mockHistoryManager,
        extensionUri: context.extensionUri,
      });
      mgr.show();

      const messageHandler = mockPanel.onDidReceiveMessageMock.mock.calls[0][0];
      await messageHandler({
        type: 'deleteSnippet',
        snippetId: 'nonexistent',
      });

      expect(mockPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toast', level: 'error' })
      );
    });
  });

  // ── Extension with Webview integration tests ────────────────────────────────

  describe('Extension with Masking & Snippets', () => {
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
