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

describe('Quick Pick & Global Hotkey', () => {
  let context: any;

  const sampleClip1 = {
    id: 'clip-1',
    content: 'Hello, world!',
    createdAt: Date.now() - 60000,
    pinned: false,
    hash: 'abc123',
  };

  const sampleClip2 = {
    id: 'clip-2',
    content: 'Pinned content here',
    createdAt: Date.now() - 120000,
    pinned: true,
    hash: 'def456',
  };

  const sampleClip3 = {
    id: 'clip-3',
    content: 'Another unpinned clip',
    createdAt: Date.now() - 30000,
    pinned: false,
    hash: 'ghi789',
  };

  beforeEach(() => {
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
    };

    mockHistoryManager.getClips.mockReturnValue([sampleClip1, sampleClip2, sampleClip3]);
    mockHistoryManager.getPinnedClips.mockReturnValue([sampleClip2]);
    mockHistoryManager.searchClips.mockReturnValue([sampleClip1]);
    mockHistoryManager.getRelativeTime.mockReturnValue('1m ago');
    mockHistoryManager.getStats.mockReturnValue({
      totalClips: 3,
      pinnedClips: 1,
      totalSnippets: 0,
      totalMaskRules: 0,
    });
    mockHistoryManager.clearHistory.mockReturnValue(3);
    mockHistoryManager.addClip.mockReturnValue(sampleClip1);

    mockSnippetEngine.getSnippets.mockReturnValue([]);
    mockSnippetEngine.resolvePlaceholders.mockReturnValue('Hello World!');
    mockHistoryManager.getAllSnippets.mockReturnValue([]);
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ── Quick Pick command ─────────────────────────────────────────────────────

  describe('Quick Pick (sentry-clip.quickPick)', () => {
    it('should register the quickPick command', () => {
      extension.activate(context);
      expect(mockRegisterCommand).toHaveBeenCalledWith('sentry-clip.quickPick', expect.any(Function));
    });

    it('should show Quick Pick with all clips', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockShowQuickPick.mockResolvedValue({ clip: sampleClip1 });
      await handler();

      expect(mockShowQuickPick).toHaveBeenCalled();
      const items = mockShowQuickPick.mock.calls[0][0] as any[];
      expect(items.length).toBe(3);
    });

    it('should show pinned clips first in Quick Pick', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockShowQuickPick.mockResolvedValue({ clip: sampleClip1 });
      await handler();

      const items = mockShowQuickPick.mock.calls[0][0] as any[];
      expect(items[0].clip.id).toBe('clip-2'); // pinned clip first
    });

    it('should write selected clip to clipboard', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockShowQuickPick.mockResolvedValue({ clip: sampleClip1 });
      await handler();

      expect(mockClipboardWriteText).toHaveBeenCalledWith(sampleClip1.content);
    });

    it('should show info message after copying', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockShowQuickPick.mockResolvedValue({ clip: sampleClip1 });
      await handler();

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Copied')
      );
    });

    it('should show info message when no clips exist', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockHistoryManager.getClips.mockReturnValue([]);
      mockShowQuickPick.mockResolvedValue(null);

      await handler();

      expect(mockShowInformationMessage).toHaveBeenCalledWith('No clips in history.');
      expect(mockShowQuickPick).not.toHaveBeenCalled();
    });

    it('should use ignoreFocusOut for Quick Pick dialog', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
      expect(quickPickOptions.ignoreFocusOut).toBe(true);
    });

    it('should use matchOnDetail and matchOnDescription for Quick Pick', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
      expect(quickPickOptions.matchOnDetail).toBe(true);
      expect(quickPickOptions.matchOnDescription).toBe(true);
    });

    it('should show placeHolder with Ctrl+Shift+V hint', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
      expect(quickPickOptions.placeHolder).toContain('Ctrl+Shift+V');
    });

    it('should handle user cancelling Quick Pick', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      expect(mockClipboardWriteText).not.toHaveBeenCalled();
      expect(mockShowInformationMessage).not.toHaveBeenCalledWith(
        expect.stringContaining('Copied')
      );
    });

    it('should include relative time in clip detail', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const items = mockShowQuickPick.mock.calls[0][0] as any[];
      expect(items[0].detail).toBe('1m ago');
    });

    it('should include pinned description for pinned clips', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const items = mockShowQuickPick.mock.calls[0][0] as any[];
      const pinnedItem = items.find((i) => i.clip.pinned);
      expect(pinnedItem?.description).toBe('📌 pinned');
    });

    it('should truncate long clip content', async () => {
      const longClip = {
        id: 'clip-long',
        content: 'A'.repeat(150),
        createdAt: Date.now(),
        pinned: false,
        hash: 'long123',
      };
      mockHistoryManager.getClips.mockReturnValue([longClip]);

      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const items = mockShowQuickPick.mock.calls[0][0] as any[];
      expect(items[0].label.length).toBeLessThanOrEqual(103); // 100 + '…'
      expect(items[0].label.endsWith('…')).toBe(true);
    });

    it('should handle error during Quick Pick', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.quickPick');

      mockHistoryManager.getClips.mockImplementation(() => {
        throw new Error('Database error');
      });

      await handler();

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Sentry Clip error')
      );
    });
  });

  // ── Global Hotkey command ──────────────────────────────────────────────────

  describe('Global Hotkey (sentry-clip.globalHotkey)', () => {
    it('should register the globalHotkey command', () => {
      extension.activate(context);
      expect(mockRegisterCommand).toHaveBeenCalledWith('sentry-clip.globalHotkey', expect.any(Function));
    });

    it('should show Quick Pick with all clips', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockShowQuickPick.mockResolvedValue({ clip: sampleClip1 });
      await handler();

      expect(mockShowQuickPick).toHaveBeenCalled();
      const items = mockShowQuickPick.mock.calls[0][0] as any[];
      expect(items.length).toBe(3);
    });

    it('should show pinned clips first in Quick Pick', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockShowQuickPick.mockResolvedValue({ clip: sampleClip1 });
      await handler();

      const items = mockShowQuickPick.mock.calls[0][0] as any[];
      expect(items[0].clip.id).toBe('clip-2'); // pinned clip first
    });

    it('should write selected clip to clipboard', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockShowQuickPick.mockResolvedValue({ clip: sampleClip1 });
      await handler();

      expect(mockClipboardWriteText).toHaveBeenCalledWith(sampleClip1.content);
    });

    it('should show info message after copying', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockShowQuickPick.mockResolvedValue({ clip: sampleClip1 });
      await handler();

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Copied')
      );
    });

    it('should show info message when no clips exist', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockHistoryManager.getClips.mockReturnValue([]);
      mockShowQuickPick.mockResolvedValue(null);

      await handler();

      expect(mockShowInformationMessage).toHaveBeenCalledWith('No clips in history.');
      expect(mockShowQuickPick).not.toHaveBeenCalled();
    });

    it('should use ignoreFocusOut for Quick Pick dialog', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
      expect(quickPickOptions.ignoreFocusOut).toBe(true);
    });

    it('should use matchOnDetail and matchOnDescription for Quick Pick', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
      expect(quickPickOptions.matchOnDetail).toBe(true);
      expect(quickPickOptions.matchOnDescription).toBe(true);
    });

    it('should show placeHolder with Global Hotkey hint', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const quickPickOptions = mockShowQuickPick.mock.calls[0][1];
      expect(quickPickOptions.placeHolder).toContain('Global Hotkey');
    });

    it('should handle user cancelling Quick Pick', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      expect(mockClipboardWriteText).not.toHaveBeenCalled();
    });

    it('should include relative time in clip detail', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const items = mockShowQuickPick.mock.calls[0][0] as any[];
      expect(items[0].detail).toBe('1m ago');
    });

    it('should include pinned description for pinned clips', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const items = mockShowQuickPick.mock.calls[0][0] as any[];
      const pinnedItem = items.find((i) => i.clip.pinned);
      expect(pinnedItem?.description).toBe('📌 pinned');
    });

    it('should truncate long clip content', async () => {
      const longClip = {
        id: 'clip-long',
        content: 'A'.repeat(150),
        createdAt: Date.now(),
        pinned: false,
        hash: 'long123',
      };
      mockHistoryManager.getClips.mockReturnValue([longClip]);

      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockShowQuickPick.mockResolvedValue(null);
      await handler();

      const items = mockShowQuickPick.mock.calls[0][0] as any[];
      expect(items[0].label.length).toBeLessThanOrEqual(103);
      expect(items[0].label.endsWith('…')).toBe(true);
    });

    it('should handle error during global hotkey', async () => {
      extension.activate(context);
      const handler = getCommandHandler('sentry-clip.globalHotkey');

      mockHistoryManager.getClips.mockImplementation(() => {
        throw new Error('Database error');
      });

      await handler();

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Sentry Clip error')
      );
    });

    it('should be registered after quickPick command', () => {
      extension.activate(context);

      const registeredCommands = mockRegisterCommand.mock.calls.map(
        (call: any[]) => call[0]
      );

      const quickPickIdx = registeredCommands.indexOf('sentry-clip.quickPick');
      const globalHotkeyIdx = registeredCommands.indexOf('sentry-clip.globalHotkey');

      expect(quickPickIdx).toBeGreaterThan(-1);
      expect(globalHotkeyIdx).toBeGreaterThan(-1);
      expect(globalHotkeyIdx).toBe(quickPickIdx + 1);
    });
  });

  // ── Keybinding configuration ───────────────────────────────────────────────

  describe('Keybinding Configuration', () => {
    it('should have Ctrl+Shift+V keybinding for quickPick', async () => {
      const pkg = await import('../package.json');
      const keybindings = pkg.default?.contributes?.keybindings || pkg.contributes?.keybindings;

      const quickPickBinding = keybindings?.find(
        (kb: any) => kb.command === 'sentry-clip.quickPick'
      );

      expect(quickPickBinding).toBeDefined();
      expect(quickPickBinding.key).toBe('ctrl+shift+v');
      expect(quickPickBinding.mac).toBe('cmd+shift+v');
      expect(quickPickBinding.when).toBe('editorTextFocus');
    });

    it('should have global hotkey binding for globalHotkey', async () => {
      const pkg = await import('../package.json');
      const keybindings = pkg.default?.contributes?.keybindings || pkg.contributes?.keybindings;

      const globalHotkeyBinding = keybindings?.find(
        (kb: any) => kb.command === 'sentry-clip.globalHotkey'
      );

      expect(globalHotkeyBinding).toBeDefined();
      expect(globalHotkeyBinding.key).toBe('ctrl+shift+c');
      expect(globalHotkeyBinding.mac).toBe('cmd+shift+c');
      expect(globalHotkeyBinding.when).toBe('true');
    });
  });
});
