import { describe, it, expect, beforeEach, afterEach, vi, MockedObject } from 'vitest';

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

describe('VS Code Plugin - Core Integration', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Default config
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

    // Reset active text editor
    mockActiveTextEditor.selection = { isEmpty: false };
    mockActiveTextEditor.document.getText = vi.fn().mockReturnValue('selected text');

    context = {
      subscriptions: [] as any[],
    };

    // Default mock returns
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

    mockSnippetEngine.getSnippets.mockReturnValue([sampleSnippet]);
    mockSnippetEngine.resolvePlaceholders.mockReturnValue('Hello World!');

    // Snippets from history manager
    mockHistoryManager.getAllSnippets.mockReturnValue([sampleSnippet]);
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ── Activation ─────────────────────────────────────────────────────────────

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
      'sentry-clip.quickPick',
      'sentry-clip.globalHotkey',
    ];

    for (const cmd of expectedCommands) {
      expect(registeredCommands).toContain(cmd);
    }
  });

  it('should listen for configuration changes', () => {
    extension.activate(context);
    expect(mockOnDidChangeConfiguration).toHaveBeenCalled();
  });

  it('should add all disposables to context.subscriptions', () => {
    extension.activate(context);

    // 10 command registrations + 1 config change listener = 11
    expect(context.subscriptions.length).toBe(11);
  });

  // ── showHistory ────────────────────────────────────────────────────────────

  it('should show Quick Pick with combined pinned + unpinned clips', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue({ clip: sampleClip });
    await handler();

    expect(mockShowQuickPick).toHaveBeenCalled();
    const items = mockShowQuickPick.mock.calls[0][0] as any[];
    expect(items.length).toBe(2); // pinned + unpinned
    // First item should be the pinned clip
    expect(items[0].clip.id).toBe('clip-2');
  });

  it('should write selected clip to clipboard', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue({ clip: sampleClip });
    await handler();

    expect(mockClipboardWriteText).toHaveBeenCalledWith(sampleClip.content);
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Copied')
    );
  });

  it('should show info message when no clips exist', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockHistoryManager.getClips.mockReturnValue([]);
    mockHistoryManager.getPinnedClips.mockReturnValue([]);
    mockShowQuickPick.mockResolvedValue(null);

    await handler();

    expect(mockShowInformationMessage).toHaveBeenCalledWith('No clipboard history.');
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  it('should use correct placeHolder for showHistory', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
    expect(quickPickOptions.placeHolder).toContain('clipboard');
  });

  it('should use ignoreFocusOut for Quick Pick dialogs', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
    expect(quickPickOptions.ignoreFocusOut).toBe(true);
  });

  it('should use matchOnDetail and matchOnDescription for Quick Pick', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.showHistory');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
    expect(quickPickOptions.matchOnDetail).toBe(true);
    expect(quickPickOptions.matchOnDescription).toBe(true);
  });

  // ── copy ───────────────────────────────────────────────────────────────────

  it('should show Quick Pick and copy selected clip', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.copy');

    mockShowQuickPick.mockResolvedValue({ clip: sampleClip });
    await handler();

    expect(mockClipboardWriteText).toHaveBeenCalledWith(sampleClip.content);
    expect(mockShowInformationMessage).toHaveBeenCalledWith('Copied to clipboard.');
  });

  it('should show info message when no clips exist', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.copy');

    mockHistoryManager.getClips.mockReturnValue([]);
    mockShowQuickPick.mockResolvedValue(null);

    await handler();

    expect(mockShowInformationMessage).toHaveBeenCalledWith('No clips to copy.');
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  // ── pin ────────────────────────────────────────────────────────────────────

  it('should toggle pin on selected clip', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.pin');

    mockShowQuickPick.mockResolvedValue({ clip: sampleClip });
    await handler();

    expect(mockHistoryManager.togglePin).toHaveBeenCalledWith(sampleClip.id);
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Pinned')
    );
  });

  it('should show info message when no clips exist', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.pin');

    mockHistoryManager.getClips.mockReturnValue([]);
    mockShowQuickPick.mockResolvedValue(null);

    await handler();

    expect(mockShowInformationMessage).toHaveBeenCalledWith('No clips to pin.');
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  // ── search ─────────────────────────────────────────────────────────────────

  it('should handle search command with input', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.search');

    mockShowInputBox.mockResolvedValue('test query');
    mockShowQuickPick.mockResolvedValue({ clip: sampleClip });
    await handler();

    expect(mockShowInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ placeHolder: expect.stringContaining('Search') })
    );
    expect(mockHistoryManager.searchClips).toHaveBeenCalledWith('test query');
    expect(mockShowQuickPick).toHaveBeenCalled();
  });

  it('should handle search command with empty input', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.search');

    mockShowInputBox.mockResolvedValue('');
    mockShowQuickPick.mockResolvedValue(null);

    await handler();

    expect(mockShowInputBox).toHaveBeenCalled();
    expect(mockHistoryManager.searchClips).not.toHaveBeenCalled();
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  it('should handle search command with null input', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.search');

    mockShowInputBox.mockResolvedValue(null);
    mockShowQuickPick.mockResolvedValue(null);

    await handler();

    expect(mockShowInputBox).toHaveBeenCalled();
    expect(mockHistoryManager.searchClips).not.toHaveBeenCalled();
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  it('should write searched clip to clipboard when selected', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.search');

    mockShowInputBox.mockResolvedValue('test');
    mockShowQuickPick.mockResolvedValue({ clip: sampleClip });
    await handler();

    expect(mockClipboardWriteText).toHaveBeenCalledWith(sampleClip.content);
  });

  it('should show info message when no search results', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.search');

    mockShowInputBox.mockResolvedValue('no results');
    mockHistoryManager.searchClips.mockReturnValue([]);
    mockShowQuickPick.mockResolvedValue(null);

    await handler();

    expect(mockShowInformationMessage).toHaveBeenCalledWith('No matching clips found.');
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  // ── showSnippets ───────────────────────────────────────────────────────────

  it('should show Quick Pick with snippets', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.showSnippets');

    mockShowQuickPick.mockResolvedValue({ snippet: sampleSnippet });
    await handler();

    expect(mockShowQuickPick).toHaveBeenCalled();
  });

  it('should resolve placeholders and copy to clipboard', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.showSnippets');

    mockShowQuickPick.mockResolvedValue({ snippet: sampleSnippet });
    await handler();

    expect(mockSnippetEngine.resolvePlaceholders).toHaveBeenCalledWith(sampleSnippet);
    expect(mockClipboardWriteText).toHaveBeenCalledWith('Hello World!');
  });

  it('should show info message when no snippets exist', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.showSnippets');

    mockHistoryManager.getAllSnippets.mockReturnValue([]);
    mockShowQuickPick.mockResolvedValue(null);

    await handler();

    expect(mockShowInformationMessage).toHaveBeenCalledWith('No snippets defined.');
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  // ── copySelection ──────────────────────────────────────────────────────────

  it('should copy current editor selection to clipboard and history', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.copySelection');

    mockShowQuickPick.mockResolvedValue(null);
    await handler();

    expect(mockHistoryManager.addClip).toHaveBeenCalledWith('selected text');
    expect(mockClipboardWriteText).toHaveBeenCalledWith(sampleClip.content);
  });

  it('should handle copySelection with no active editor', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.copySelection');

    mockActiveTextEditor.selection = { isEmpty: true };
    mockActiveTextEditor.document.getText = vi.fn().mockReturnValue('');

    await handler();

    expect(mockShowInformationMessage).toHaveBeenCalled();
    expect(mockHistoryManager.addClip).not.toHaveBeenCalled();
  });

  // ── stats ──────────────────────────────────────────────────────────────────

  it('should handle stats command', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.stats');

    await handler();

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Sentry Clip Stats')
    );
  });

  // ── clearHistory ───────────────────────────────────────────────────────────

  it('should handle clearHistory with confirmation', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.clearHistory');

    mockShowWarningMessage.mockResolvedValue('Yes, clear all');

    await handler();

    expect(mockShowWarningMessage).toHaveBeenCalled();
    expect(mockHistoryManager.clearHistory).toHaveBeenCalled();
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Cleared')
    );
  });

  it('should handle clearHistory with cancellation', async () => {
    extension.activate(context);
    const handler = getCommandHandler('sentry-clip.clearHistory');

    mockShowWarningMessage.mockResolvedValue(undefined);

    await handler();

    expect(mockShowWarningMessage).toHaveBeenCalled();
    expect(mockHistoryManager.clearHistory).not.toHaveBeenCalled();
  });

  // ── deactivate ─────────────────────────────────────────────────────────────

  it('should handle deactivate properly', () => {
    extension.activate(context);
    expect(() => extension.deactivate()).not.toThrow();
  });

  it('should call historyManager.close on deactivate', async () => {
    extension.activate(context);
    // Trigger a command handler to initialize the historyManager singleton
    const handler = getCommandHandler('sentry-clip.showHistory');
    mockShowQuickPick.mockResolvedValue(null);
    await handler();
    // Now deactivate should close the historyManager
    extension.deactivate();
    expect(mockHistoryManager.close).toHaveBeenCalled();
  });

  // ── Error handling ─────────────────────────────────────────────────────────

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

  // ── Config refresh ─────────────────────────────────────────────────────────

  it('should refresh config on settings change', () => {
    extension.activate(context);

    // Simulate a config change event
    const configCallback = mockOnDidChangeConfiguration.mock.calls[0][0];
    configCallback({ affectsConfiguration: (key: string) => key === 'sentryClip' });

    expect(mockHistoryManager.setConfig).toHaveBeenCalled();
  });
});
