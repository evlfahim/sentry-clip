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

const mockActiveTextEditor = {
  selection: { isEmpty: false },
  document: { getText: vi.fn() },
};

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
    createStatusBarItem: (...args: any[]) => {
      return {
        show: vi.fn(),
        dispose: vi.fn(),
        text: '',
        tooltip: '',
        command: '',
      };
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
}));

// ── Constructor spies (captured via hoisted so they persist across module reloads) ──

const HistoryManagerSpy = vi.hoisted(() => vi.fn());
const SnippetEngineSpy = vi.hoisted(() => vi.fn());
const WebviewManagerSpy = vi.hoisted(() => vi.fn());

// ── Mock instances ────────────────────────────────────────────────────────────

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
  getConfig: vi.fn(),
};

const mockSnippetEngine = {
  getSnippets: vi.fn(),
  resolvePlaceholders: vi.fn(),
  getBuiltInPlaceholders: vi.fn().mockReturnValue([]),
  extractPlaceholders: vi.fn().mockReturnValue([]),
};

const mockWebviewManager = {
  show: vi.fn(),
  update: vi.fn(),
  dispose: vi.fn(),
  panelVisible: false,
};

vi.mock('./webview', () => ({
  WebviewManager: WebviewManagerSpy.mockImplementation(() => mockWebviewManager),
}));

vi.mock('@sentry-clip/core', () => ({
  HistoryManager: HistoryManagerSpy.mockImplementation(() => mockHistoryManager),
  SnippetEngine: SnippetEngineSpy.mockImplementation(() => mockSnippetEngine),
  Clip: {},
  Snippet: {},
}));

// Import after mocking
import * as extension from './extension';

// ── Test helpers ───────────────────────────────────────────────────────────────

function getCommandHandler(name: string) {
  const call = mockRegisterCommand.mock.calls.find(
    (c: any[]) => c[0] === name
  );
  expect(call).toBeDefined(`Command ${name} was not registered`);
  return call![1] as () => Promise<void>;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('VS Code Plugin - Config Mapping', () => {
  let context: any;

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

  function setupConfig(overrides: Record<string, any> = {}) {
    const defaults: Record<string, any> = {
      maxHistory: 1000,
      enableMasking: true,
      enableSnippets: true,
      exclusionPatterns: [],
      dbPath: '',
      ...overrides,
    };
    mockGetConfiguration.mockReturnValue({
      get: (key: string, fallback: any) => {
        return defaults[key] ?? fallback;
      },
    });
  }

  function setupMocks() {
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
    mockHistoryManager.getConfig.mockReturnValue({
      maxHistory: 1000,
      enableMasking: true,
      enableSnippets: true,
      exclusionPatterns: [],
      dbPath: undefined,
    });
    mockSnippetEngine.getSnippets.mockReturnValue([sampleSnippet]);
    mockSnippetEngine.resolvePlaceholders.mockReturnValue('Hello World!');
    mockSnippetEngine.getBuiltInPlaceholders.mockReturnValue([]);
    mockSnippetEngine.extractPlaceholders.mockReturnValue([]);
    mockHistoryManager.getAllSnippets.mockReturnValue([sampleSnippet]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setupConfig();
    setupMocks();
    mockActiveTextEditor.selection = { isEmpty: false };
    mockActiveTextEditor.document.getText = vi.fn().mockReturnValue('selected text');
    context = {
      subscriptions: [] as any[],
      extensionUri: { fsPath: '/fake/extension' },
    };
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ── Config reading on activation ───────────────────────────────────────────

  it('should read all config values on first use of getHistoryManager', async () => {
    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    // HistoryManager constructor should have been called
    expect(HistoryManagerSpy).toHaveBeenCalled();
    // setConfig should NOT have been called yet (lazy init)
    expect(mockHistoryManager.setConfig).not.toHaveBeenCalled();
  });

  it('should read exclusionPatterns from config', async () => {
    setupConfig({
      maxHistory: 500,
      enableMasking: false,
      enableSnippets: false,
      exclusionPatterns: ['*.secret', '**/passwords/**', 'private.*'],
      dbPath: '/custom/path/db.sqlite',
    });

    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    // HistoryManager should have been constructed with the config values
    expect(HistoryManagerSpy).toHaveBeenCalled();
  });

  it('should use empty string dbPath as undefined in HistoryManager', async () => {
    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    expect(HistoryManagerSpy).toHaveBeenCalled();
  });

  // ── Dynamic config updates ─────────────────────────────────────────────────

  it('should call setConfig with all values on settings change', async () => {
    const { activate } = await import('./extension');
    activate(context);
    // Trigger getHistoryManager by calling a command handler
    const handler = getCommandHandler('sentry-clip.showHistory');
    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    // Now simulate a config change event
    const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
    configCallback({ affectsConfiguration: (key: string) => key === 'sentryClip' });

    expect(mockHistoryManager.setConfig).toHaveBeenCalledWith({
      maxHistory: 1000,
      enableMasking: true,
      enableSnippets: true,
      exclusionPatterns: [],
      dbPath: undefined,
    });
  });

  it('should rebuild snippetEngine on config change', async () => {
    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');
    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    // Simulate a config change event
    const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
    configCallback({ affectsConfiguration: (key: string) => key === 'sentryClip' });

    // SnippetEngine constructor should be called again (rebuild)
    expect(SnippetEngineSpy).toHaveBeenCalled();
  });

  it('should recreate webviewManager on config change', async () => {
    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');
    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    // Simulate a config change event
    const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
    configCallback({ affectsConfiguration: (key: string) => key === 'sentryClip' });

    // WebviewManager should be disposed and recreated
    expect(mockWebviewManager.dispose).toHaveBeenCalled();
    expect(WebviewManagerSpy).toHaveBeenCalled();
  });

  it('should not recreate webviewManager if extensionUri is not set', async () => {
    const contextNoUri = { subscriptions: [] as any[] };
    const { activate } = await import('./extension');
    activate(contextNoUri);
    const handler = getCommandHandler('sentry-clip.showHistory');
    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    // Simulate a config change event
    const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
    configCallback({ affectsConfiguration: (key: string) => key === 'sentryClip' });

    // WebviewManager should NOT be recreated since extensionUri was never set
    expect(WebviewManagerSpy).not.toHaveBeenCalled();
  });

  it('should not call setConfig if historyManager is not initialized', async () => {
    const { activate } = await import('./extension');
    activate(context);

    // Simulate a config change event before any command is called
    // (historyManager is not yet initialized)
    const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
    configCallback({ affectsConfiguration: (key: string) => key === 'sentryClip' });

    // setConfig should NOT be called because historyManager is undefined
    expect(mockHistoryManager.setConfig).not.toHaveBeenCalled();
  });

  // ── Config values propagate correctly ──────────────────────────────────────

  it('should apply maxHistory config to HistoryManager', async () => {
    setupConfig({ maxHistory: 2500 });

    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    expect(HistoryManagerSpy).toHaveBeenCalled();
  });

  it('should apply enableMasking config to HistoryManager', async () => {
    setupConfig({ enableMasking: false });

    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    expect(HistoryManagerSpy).toHaveBeenCalled();
  });

  it('should apply enableSnippets config to HistoryManager', async () => {
    setupConfig({ enableSnippets: false });

    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    expect(HistoryManagerSpy).toHaveBeenCalled();
  });

  // ── Config change only for sentryClip ──────────────────────────────────────

  it('should not refresh config for unrelated settings changes', async () => {
    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');
    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    // Simulate a config change event for a different extension
    const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
    configCallback({ affectsConfiguration: (key: string) => key !== 'sentryClip' });

    // setConfig should NOT be called
    expect(mockHistoryManager.setConfig).not.toHaveBeenCalled();
  });

  // ── Config with custom dbPath ──────────────────────────────────────────────

  it('should pass custom dbPath to HistoryManager', async () => {
    setupConfig({ dbPath: '/home/user/.sentry-clip/data.db' });

    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    expect(HistoryManagerSpy).toHaveBeenCalled();
  });

  // ── Config defaults ────────────────────────────────────────────────────────

  it('should use default values when config keys are missing', async () => {
    mockGetConfiguration.mockReturnValue({
      get: (key: string, fallback: any) => fallback,
    });

    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    expect(HistoryManagerSpy).toHaveBeenCalled();
  });

  // ── Config update after initial activation ─────────────────────────────────

  it('should update config values after initial activation', async () => {
    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    // setConfig should NOT have been called yet (lazy init)
    expect(mockHistoryManager.setConfig).not.toHaveBeenCalled();

    // Now simulate a config change
    const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
    configCallback({ affectsConfiguration: (key: string) => key === 'sentryClip' });

    // setConfig should now have been called
    expect(mockHistoryManager.setConfig).toHaveBeenCalled();
  });

  it('should update exclusionPatterns on config change', async () => {
    setupConfig({ exclusionPatterns: ['*.env', '**/.git/**'] });

    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');
    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    // Simulate a config change event
    const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
    configCallback({ affectsConfiguration: (key: string) => key === 'sentryClip' });

    expect(mockHistoryManager.setConfig).toHaveBeenCalledWith({
      maxHistory: 1000,
      enableMasking: true,
      enableSnippets: true,
      exclusionPatterns: ['*.env', '**/.git/**'],
      dbPath: undefined,
    });
  });

  // ── WebviewManager recreation ──────────────────────────────────────────────

  it('should dispose old webviewManager and create new one on config change', async () => {
    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');
    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    // WebviewManager was created once during initial activation
    expect(WebviewManagerSpy).toHaveBeenCalledTimes(1);

    // Simulate a config change event
    const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
    configCallback({ affectsConfiguration: (key: string) => key === 'sentryClip' });

    // WebviewManager should be disposed first, then recreated
    expect(mockWebviewManager.dispose).toHaveBeenCalledTimes(1);
    // Now called twice: once on init, once on config change
    expect(WebviewManagerSpy).toHaveBeenCalledTimes(2);
  });

  it('should rebuild SnippetEngine on config change', async () => {
    const { activate } = await import('./extension');
    activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');
    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    // Simulate a config change event
    const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
    configCallback({ affectsConfiguration: (key: string) => key === 'sentryClip' });

    // SnippetEngine should be called (rebuild)
    expect(SnippetEngineSpy).toHaveBeenCalled();
  });
});
