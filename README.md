# Sentry Clip

A secure, modular clipboard manager with regex-based sensitive data masking, dynamic snippets with placeholders, and robust full-text search. Built as a monorepo with a reusable core library and a VS Code extension, with a headless CLI for automation.

## Features

- **Clipboard History** — Persistent, indexed history of every clipboard copy with full-text search (FTS5) and substring fallback.
- **Pinning** — Pin important clips so they survive history limits and cleanup.
- **Sensitive Data Masking** — Configurable regex rules that automatically mask PII (emails, credit cards, SSNs, etc.) before storing clips. Toggle rules on/off from the UI.
- **Snippets with Placeholders** — Create reusable text templates with dynamic placeholders:
  - **Built-in:** `{{timestamp}}`, `{{date}}`, `{{time}}`, `{{datetime}}`, `{{hostname}}`, `{{username}}`, `{{uuid}}`, `{{random}}`, `{{epoch}}`, `{{selection}}`, `{{cursor}}`, `{{clipboard}}`
  - **User-defined:** Any `{{placeholder}}` syntax; values are resolved at render time.
- **Exclusion Patterns** — Glob patterns (e.g. `**/node_modules/**`, `*password*`) to automatically skip sensitive or noisy content.
- **Relative Timestamps** — Human-readable times like "3m ago", "2h ago", "5d ago" with hover tooltips showing the absolute date.
- **Status Bar Integration** — VS Code status bar shows clip count and pinned count; click to open the history panel.
- **Quick Pick & Global Hotkey** — `Ctrl+Shift+V` (or `Cmd+Shift+V` on macOS) opens a Quick Pick for fast clip selection. A separate global hotkey (`Ctrl+Shift+C`) works outside the editor.
- **Headless CLI** — Use Sentry Clip from the terminal for scripting and automation.
- **SQLite Persistence** — All data stored in a local SQLite database with WAL mode and optimized FTS indexes.

## Architecture

```
sentry-clip/
├── packages/
│   ├── core/                    # Pure Node.js / TypeScript core library
│   │   ├── src/
│   │   │   ├── models.ts        # Clip, Snippet, MaskRule, Pin, ClipHistoryConfig
│   │   │   ├── storage.ts       # SQLite layer (ClipStorage) with FTS5 indexing
│   │   │   ├── masking.ts       # MaskEngine — regex-based sensitive data masking
│   │   │   ├── snippets.ts      # SnippetEngine — placeholder resolution
│   │   │   ├── history.ts       # HistoryManager — orchestrates storage, masking, snippets
│   │   │   ├── cli.ts           # CLI interface (runCli, parseArgs)
│   │   │   └── index.ts         # Public exports
│   │   └── package.json
│   └── vscode-plugin/           # VS Code extension (sentry-clip-vscode)
│       ├── src/
│       │   ├── extension.ts     # activate(), deactivate(), command handlers
│       │   ├── webview.ts       # WebviewManager — panel lifecycle, message bridge
│       │   ├── webview.html     # Webview UI (HTML + CSS + JS, CSP-safe)
│       │   └── *.test.ts        # Unit tests
│       └── package.json
├── scripts/
│   └── validate-vscode-extension.js
├── package.json                 # Root workspace config
├── tsconfig.json
└── vitest.config.ts
```

The **core** (`@sentry-clip/core`) is a pure Node.js library with zero VS Code dependencies. The **VS Code plugin** (`sentry-clip-vscode`) imports the core, bridges VS Code APIs (Quick Pick, Webview, status bar, settings) to the core, and renders the UI via a Webview. This separation allows the core to be reused in a Tauri desktop app, a standalone Electron app, or any other host.

## Prerequisites

- **Node.js** ≥ 18.0.0
- **npm** ≥ 9 (for workspace support)
- For the VS Code extension: **VS Code** ≥ 1.85.0

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

This compiles both `@sentry-clip/core` and `sentry-clip-vscode` to their `dist/` directories.

### 3. Run tests

```bash
npm test
```

Or run specific test suites:

```bash
npm run test:storage          # Storage layer tests
npm run test:masking          # Masking engine tests
npm run test:snippets         # Snippet engine tests
npm run test:history          # History manager tests
npm run test:cli              # CLI tests
npm run vscode:test           # VS Code extension tests
npm run vscode:test-ui        # Webview UI tests
```

### 4. Use the CLI (headless)

```bash
# Show help
npx sentry-clip help

# Add a clip
npx sentry-clip add "Hello, world!"

# List all clips
npx sentry-clip list

# List with JSON output
npx sentry-clip list --json

# Search clips
npx sentry-clip search "world"

# Pin a clip
npx sentry-clip pin <clip-id>

# Unpin a clip
npx sentry-clip unpin <clip-id>

# Delete a clip
npx sentry-clip delete <clip-id>

# Show stats
npx sentry-clip stats --json

# Clear all clips
npx sentry-clip clear

# List snippets
npx sentry-clip snippets

# Add a snippet
npx sentry-clip snippet-add "Greeting" "Hello, {{name}}!"

# Delete a snippet
npx sentry-clip snippet-delete <snippet-id>
```

**Database location:** By default, the CLI uses `~/.sentry-clip/clips.db`. Override with `--db <path>` or the `SENTRY_CLIP_DB` environment variable.

### 5. Run the VS Code Extension

1. Open the project root in VS Code.
2. Press `F5` (or run the **Run** → **Start Debugging** command). This launches an Extension Development Host window with Sentry Clip loaded.
3. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Sentry Clip: Show Clipboard History** to open the Webview.
4. Use `Ctrl+Shift+V` (or `Cmd+Shift+V` on macOS) for the Quick Pick flow.
5. Use `Ctrl+Shift+C` (or `Cmd+Shift+C` on macOS) for the global hotkey.

### 6. Package the VS Code Extension

```bash
npm run vscode:package
```

This builds the extension and validates the package with `scripts/validate-vscode-extension.js`. The resulting `.vsix` file can be installed manually in VS Code via **Extensions: Install from VSIX**.

## Configuration

All settings are accessible through VS Code's settings UI under **Sentry Clip** or by editing `settings.json`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `sentryClip.maxHistory` | number | 1000 | Maximum number of clipboard history entries to keep |
| `sentryClip.enableMasking` | boolean | true | Enable sensitive data masking on new clips |
| `sentryClip.enableSnippets` | boolean | true | Enable snippet support |
| `sentryClip.exclusionPatterns` | string[] | [] | Glob patterns for content to exclude from history |
| `sentryClip.dbPath` | string | "" | Custom SQLite database path (empty = default location) |

Settings changes are detected automatically and applied without restarting the extension.

## CLI Reference

```
sentry-clip <command> [options]

Commands:
  list                          List all clips (or pinned with --pinned)
  search <query>                Search clips by content
  add <content>                 Add a new clip
  pin <id>                      Pin a clip by ID
  unpin <id>                    Unpin a clip by ID
  delete <id>                   Delete a clip by ID
  stats                         Show clip/snippet/mask stats
  clear                         Clear all clips
  snippets                      List all snippets
  snippet-add <name> <content>  Add a snippet
  snippet-delete <id>           Delete a snippet
  help                          Show this help message

Options:
  --db <path>       SQLite database path (default: $SENTRY_CLIP_DB or ~/.sentry-clip/clips.db)
  --json            Output results as JSON
  --pinned          Filter to pinned clips only
  --limit <N>       Limit number of results
  --offset <N>      Offset for pagination
  --                Treat all following arguments as positional
```

## Converting the Core into a Standalone Desktop Plugin

The core library (`@sentry-clip/core`) is intentionally decoupled from any UI framework. Here is a step-by-step guide to building a standalone desktop application using the core.

### Step 1: Create a new project

```bash
mkdir sentry-clip-desktop
cd sentry-clip-desktop
npm init -y
```

### Step 2: Install dependencies

```bash
npm install @sentry-clip/core
# If building from source, link the local package:
# npm install file:../packages/core
```

For a Tauri-based desktop app, also install Tauri dependencies:

```bash
npm install -D @tauri-apps/cli
npx tauri init
```

### Step 3: Initialize the HistoryManager

```typescript
import { HistoryManager, MaskEngine, SnippetEngine } from '@sentry-clip/core';

// Create the history manager with default settings
const historyManager = new HistoryManager({
  maxHistory: 1000,
  enableMasking: true,
  enableSnippets: true,
  exclusionPatterns: [],
  dbPath: './clips.db',  // Persistent SQLite database
});

// Optionally add custom mask rules
const maskEngine = new MaskEngine();
maskEngine.addRule({
  id: 'email',
  name: 'Email',
  pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  replacement: '[REDACTED]',
  enabled: true,
});
historyManager.setMaskEngine(maskEngine);
```

### Step 4: Build the UI

Choose a UI framework. Here are two approaches:

#### Option A: Tauri (Rust + Webview)

1. **Rust side** (`src/main.rs`): Use the `tauri::command` macro to expose core functions to the webview.

```rust
use tauri::command;

#[command]
fn list_clips() -> Vec<serde_json::Value> {
    // Call into the Node.js core via a child process or FFI
    // Or embed the core logic directly in Rust
    vec![]
}
```

2. **Frontend** (Svelte/React/Vue): Build a webview UI that calls Tauri commands.

```svelte
<script>
  import { invoke } from '@tauri-apps/api/tauri';
  import { onMount } from 'svelte';

  let clips = [];

  onMount(async () => {
    clips = await invoke('list_clips');
  });
</script>
```

#### Option B: Electron (JavaScript/TypeScript)

1. **Main process** (`main.js`): Require the core directly.

```javascript
const { HistoryManager } = require('@sentry-clip/core');

const historyManager = new HistoryManager({
  dbPath: path.join(app.getPath('userData'), 'clips.db'),
});

// Expose via IPC
ipcMain.handle('list-clips', () => historyManager.getClips());
ipcMain.handle('add-clip', (_, content) => historyManager.addClip(content));
ipcMain.handle('toggle-pin', (_, clipId) => historyManager.togglePin(clipId));
ipcMain.handle('clear-history', () => historyManager.clearHistory());
ipcMain.handle('get-stats', () => historyManager.getStats());
```

2. **Renderer process** (React/Vue/Vanilla): Call IPC handlers from the UI.

```javascript
const { ipcRenderer } = require('electron');

async function loadClips() {
  const clips = await ipcRenderer.invoke('list-clips');
  // Render clips to the DOM
}
```

### Step 5: Implement core operations

| Operation | Core Method | Description |
|---|---|---|
| Add clip | `historyManager.addClip(content)` | Adds a clip with masking applied |
| List clips | `historyManager.getClips(options?)` | Returns clips with optional filtering |
| Search clips | `historyManager.searchClips(query)` | Full-text search with FTS5 |
| Advanced search | `historyManager.searchClipsAdvanced(options)` | Query + pinned filter + pagination |
| Pin clip | `historyManager.pinClip(clipId)` | Pin a clip by ID |
| Unpin clip | `historyManager.unpinClip(clipId)` | Unpin a clip by ID |
| Toggle pin | `historyManager.togglePin(clipId)` | Toggle pin state |
| Delete clip | `historyManager.deleteClip(clipId)` | Delete a clip by ID |
| Clear history | `historyManager.clearHistory()` | Remove all clips |
| Get stats | `historyManager.getStats()` | Returns counts for clips, pins, snippets, mask rules |
| Relative time | `historyManager.getRelativeTime(timestamp)` | Returns "3m ago", "2h ago", etc. |
| Add snippet | `historyManager.addSnippet(snippet)` | Add a snippet with placeholders |
| List snippets | `historyManager.getAllSnippets()` | Get all snippets |
| Delete snippet | `historyManager.deleteSnippet(id)` | Delete a snippet by ID |

### Step 6: Handle masking

```typescript
import { MaskEngine } from '@sentry-clip/core';

const maskEngine = new MaskEngine();

// Add a rule to mask email addresses
maskEngine.addRule({
  id: 'email',
  name: 'Email',
  pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  replacement: '[REDACTED]',
  enabled: true,
});

// Add a rule to mask credit card numbers
maskEngine.addRule({
  id: 'credit-card',
  name: 'Credit Card',
  pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
  replacement: '****-****-****-****',
  enabled: true,
});

// Apply masking to content
const masked = maskEngine.mask('Contact me at user@example.com');
// Result: "Contact me at [REDACTED]"
```

### Step 7: Handle snippets

```typescript
import { SnippetEngine } from '@sentry-clip/core';

const snippetEngine = new SnippetEngine();

// Create a snippet with placeholders
const snippet = {
  id: 'greeting',
  name: 'Greeting',
  content: 'Hello, {{name}}! Today is {{date}}.',
  placeholders: ['name'],
  createdAt: Date.now(),
};

snippetEngine.addSnippet(snippet);

// Resolve placeholders
const resolved = snippetEngine.resolvePlaceholders(snippet, { name: 'Alice' });
// Result: "Hello, Alice! Today is 2024-01-15."

// Built-in placeholders are resolved automatically
const resolvedWithBuiltIn = snippetEngine.resolvePlaceholders(snippet, { name: 'Bob' });
// Result: "Hello, Bob! Today is 2024-01-15." (date is auto-resolved)
```

### Step 8: Expose to the UI

Wire up IPC (Electron) or Tauri commands to the core methods. The pattern is:

1. **Receive user action** from the UI (click, input change, etc.)
2. **Call the appropriate core method** (e.g., `historyManager.addClip()`)
3. **Update the UI** with the result (re-render clip list, update stats, etc.)
4. **Handle errors** gracefully (show toast, log, etc.)

### Step 9: Test the desktop app

```bash
# Tauri dev
npx tauri dev

# Electron dev
npm start
```

### Step 10: Package for distribution

```bash
# Tauri
npx tauri build

# Electron
npx electron-builder
```

## Project Structure

| Path | Description |
|---|---|
| `packages/core/src/models.ts` | Data models: `Clip`, `Snippet`, `MaskRule`, `Pin`, `ClipHistoryConfig` |
| `packages/core/src/storage.ts` | SQLite storage layer with FTS5 full-text search |
| `packages/core/src/masking.ts` | Regex-based sensitive data masking engine |
| `packages/core/src/snippets.ts` | Snippet engine with built-in and user-defined placeholder resolution |
| `packages/core/src/history.ts` | `HistoryManager` — orchestrates storage, masking, snippets, and exclusion patterns |
| `packages/core/src/cli.ts` | Headless CLI interface (`runCli`, `parseArgs`) |
| `packages/core/src/index.ts` | Public API exports |
| `packages/vscode-plugin/src/extension.ts` | VS Code extension: commands, status bar, Quick Pick, settings bridge |
| `packages/vscode-plugin/src/webview.ts` | Webview manager: panel lifecycle, message handling, state management |
| `packages/vscode-plugin/src/webview.html` | Webview UI: HTML, CSS, and client-side JavaScript |
| `scripts/validate-vscode-extension.js` | Validates the VS Code extension package before publishing |

## License

MIT
