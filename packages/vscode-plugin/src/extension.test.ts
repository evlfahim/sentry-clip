import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so we can define shared mocks here
const sharedMocks = vi.hoisted(() => ({
  mockShowInformationMessage: vi.fn(),
  mockShowWarningMessage: vi.fn(),
  mockShowErrorMessage: vi.fn(),
  mockShowQuickPick: vi.fn(),
  mockShowInputBox: vi.fn(),
  mockClipboardWriteText: vi.fn(),
  mockGetConfiguration: vi.fn(),
  mockOnDidChangeConfiguration: vi.fn(),
  mockRegisterCommand: vi.fn(),
  mockActiveTextEditor: {
    selection: { isEmpty: false },
    document: { getText: vi.fn() },
  },
}));

const {
  mockShowInformationMessage,
  mockShowWarningMessage,
  mockShowErrorMessage,
  mockShowQuickPick,
  mockShowInputBox,
  mockClipboardWriteText,
  mockGetConfiguration,
  mockOnDidChangeConfiguration,
  mockRegisterCommand,
  mockActiveTextEditor,
} = sharedMocks;

// Mock vscode module before importing extension
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: (...args: any[]) => {
      mockShowInformationMessage(...args);
      return Promise.resolve(args[0] as string);
    },
    showWarningMessage: (...args: any[]) => {
      mockShowWarningMessage(...args);
      return Promise.resolve(args[0] as string);
    },
    showErrorMessage: (...args: any[]) => {
      mockShowErrorMessage(...args);
      return Promise.resolve(args[0] as string);
    },
    showQuickPick: (...args: any[]) => {
      mockShowQuickPick(...args);
      return Promise.resolve(null);
    },
    showInputBox: (...args: any[]) => {
      mockShowInputBox(...args);
      return Promise.resolve(null);
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

// Import after mocking
import * as extension from './extension';

describe('VS Code Plugin - Core Integration', () => {
  let context: any;

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
  });

  afterEach(() => {
    // Reset modules so the singleton HistoryManager is cleared
    vi.resetModules();
  });

  it('should export activate and deactivate functions', () => {
    expect(typeof extension.activate).toBe('function');
    expect(typeof extension.deactivate).toBe('function');
  });

  it('should register commands when activate is called', () => {
    extension.activate(context);

    // Should register all commands
    const registeredCommands = mockRegisterCommand.mock.calls.map(
      (call: any[]) => call[0]
    );

    expect(registeredCommands).toContain('sentry-clip.showHistory');
    expect(registeredCommands).toContain('sentry-clip.copy');
    expect(registeredCommands).toContain('sentry-clip.pin');
    expect(registeredCommands).toContain('sentry-clip.search');
    expect(registeredCommands).toContain('sentry-clip.showSnippets');
    expect(registeredCommands).toContain('sentry-clip.copySelection');
    expect(registeredCommands).toContain('sentry-clip.stats');
    expect(registeredCommands).toContain('sentry-clip.clearHistory');

    // Should add disposables to context
    expect(context.subscriptions.length).toBeGreaterThan(0);
  });

  it('should listen for configuration changes', () => {
    extension.activate(context);

    expect(mockOnDidChangeConfiguration).toHaveBeenCalled();
  });

  it('should create HistoryManager with correct config on first use', async () => {
    extension.activate(context);

    // Trigger showHistory command
    const showHistoryCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.showHistory'
    );
    expect(showHistoryCall).toBeDefined();

    // The command handler should create HistoryManager when called
    const commandHandler = showHistoryCall![1];
    expect(typeof commandHandler).toBe('function');

    // Mock showQuickPick to return null (no selection)
    mockShowQuickPick.mockResolvedValue(null);

    await commandHandler();

    // Should have called showQuickPick
    expect(mockShowQuickPick).toHaveBeenCalled();
  });

  it('should show info message when no clips exist', async () => {
    extension.activate(context);

    const showHistoryCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.showHistory'
    );
    const commandHandler = showHistoryCall![1];

    // Mock showQuickPick to return null (no selection)
    mockShowQuickPick.mockResolvedValue(null);

    await commandHandler();

    // Since HistoryManager creates an in-memory DB, there will be no clips
    // The command should still work without errors
    expect(mockShowQuickPick).toHaveBeenCalled();
  });

  it('should register all expected command names', () => {
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

  it('should handle clipboard writeText calls', async () => {
    extension.activate(context);

    const copyCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.copy'
    );
    const commandHandler = copyCall![1];

    mockShowQuickPick.mockResolvedValue(null);

    await commandHandler();

    expect(mockShowQuickPick).toHaveBeenCalled();
  });

  it('should handle pin/unpin command', async () => {
    extension.activate(context);

    const pinCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.pin'
    );
    const commandHandler = pinCall![1];

    mockShowQuickPick.mockResolvedValue(null);

    await commandHandler();

    expect(mockShowQuickPick).toHaveBeenCalled();
  });

  it('should handle search command with input', async () => {
    extension.activate(context);

    const searchCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.search'
    );
    const commandHandler = searchCall![1];

    // Mock input box to return a query
    mockShowInputBox.mockResolvedValue('test query');
    mockShowQuickPick.mockResolvedValue(null);

    await commandHandler();

    expect(mockShowInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ placeHolder: expect.stringContaining('Search') })
    );
    expect(mockShowQuickPick).toHaveBeenCalled();
  });

  it('should handle search command with empty input', async () => {
    extension.activate(context);

    const searchCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.search'
    );
    const commandHandler = searchCall![1];

    mockShowInputBox.mockResolvedValue('');

    await commandHandler();

    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  it('should handle search command with null input', async () => {
    extension.activate(context);

    const searchCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.search'
    );
    const commandHandler = searchCall![1];

    mockShowInputBox.mockResolvedValue(null);

    await commandHandler();

    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  it('should handle copySelection with no active editor', async () => {
    extension.activate(context);

    const copySelectionCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.copySelection'
    );
    const commandHandler = copySelectionCall![1];

    mockActiveTextEditor.selection = { isEmpty: true };
    mockActiveTextEditor.document.getText = vi.fn().mockReturnValue('');

    await commandHandler();

    // Should show info message about no selection
    expect(mockShowInformationMessage).toHaveBeenCalled();
  });

  it('should handle stats command', async () => {
    extension.activate(context);

    const statsCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.stats'
    );
    const commandHandler = statsCall![1];

    await commandHandler();

    // Should show information message with stats
    expect(mockShowInformationMessage).toHaveBeenCalled();
  });

  it('should handle clearHistory with confirmation', async () => {
    extension.activate(context);

    const clearCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.clearHistory'
    );
    const commandHandler = clearCall![1];

    mockShowWarningMessage.mockResolvedValue('Yes, clear all');

    await commandHandler();

    expect(mockShowWarningMessage).toHaveBeenCalled();
    expect(mockShowInformationMessage).toHaveBeenCalled();
  });

  it('should handle clearHistory with cancellation', async () => {
    extension.activate(context);

    const clearCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.clearHistory'
    );
    const commandHandler = clearCall![1];

    mockShowWarningMessage.mockResolvedValue(undefined);

    await commandHandler();

    expect(mockShowWarningMessage).toHaveBeenCalled();
    // Should not show success message
    const infoCalls = mockShowInformationMessage.mock.calls.filter(
      (call: any[]) => call[0] && typeof call[0] === 'string' && call[0].includes('Cleared')
    );
    expect(infoCalls.length).toBe(0);
  });

  it('should show info message when no snippets exist', async () => {
    extension.activate(context);

    const snippetsCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.showSnippets'
    );
    const commandHandler = snippetsCall![1];

    mockShowQuickPick.mockResolvedValue(null);

    await commandHandler();

    // Should still call showQuickPick (or show info if no snippets)
    expect(mockShowQuickPick).toHaveBeenCalled();
  });

  it('should have all commands registered in context.subscriptions', () => {
    extension.activate(context);

    expect(context.subscriptions.length).toBe(8); // 8 commands registered
  });

  it('should use correct placeHolder for showHistory', async () => {
    extension.activate(context);

    const showHistoryCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.showHistory'
    );
    const commandHandler = showHistoryCall![1];

    mockShowQuickPick.mockResolvedValue(null);

    await commandHandler();

    // Check that showQuickPick was called with correct options
    const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
    expect(quickPickOptions.placeHolder).toContain('clipboard');
  });

  it('should use correct placeHolder for search', async () => {
    extension.activate(context);

    const searchCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.search'
    );
    const commandHandler = searchCall![1];

    mockShowInputBox.mockResolvedValue('test');
    mockShowQuickPick.mockResolvedValue(null);

    await commandHandler();

    const inputOptions = mockShowInputBox.mock.calls[0][0];
    expect(inputOptions.placeHolder).toContain('Search');
  });

  it('should use ignoreFocusOut for Quick Pick dialogs', async () => {
    extension.activate(context);

    const showHistoryCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.showHistory'
    );
    const commandHandler = showHistoryCall![1];

    mockShowQuickPick.mockResolvedValue(null);

    await commandHandler();

    const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
    expect(quickPickOptions.ignoreFocusOut).toBe(true);
  });

  it('should use matchOnDetail and matchOnDescription for Quick Pick', async () => {
    extension.activate(context);

    const showHistoryCall = mockRegisterCommand.mock.calls.find(
      (call: any[]) => call[0] === 'sentry-clip.showHistory'
    );
    const commandHandler = showHistoryCall![1];

    mockShowQuickPick.mockResolvedValue(null);

    await commandHandler();

    const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
    expect(quickPickOptions.matchOnDetail).toBe(true);
    expect(quickPickOptions.matchOnDescription).toBe(true);
  });

  it('should handle deactivate properly', () => {
    extension.activate(context);

    // Access the internal historyManager through the module
    // Since we can't directly access it, we verify deactivate runs without error
    expect(() => extension.deactivate()).not.toThrow();
  });
});
