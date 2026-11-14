# sentry-clip

> A secure, modular clipboard manager with regex-based sensitive data masking, dynamic snippets with placeholders, and robust search, architected for seamless VS Code and desktop integration.

Task: Clipboard history manager with search, pinning, snippets with placeholders and sensitive-data masking; later a VS Code plugin #plugin #vscode #desktop

## Why it is better than what exists
- edgardmessias/vscode.clipboard-manager
- TogetherBuilt/smart-clipboard-manager

## Features
- Clipboard history with full-text search
- Pinning clips to survive limits
- Snippets with dynamic placeholders (e.g., {{timestamp}}, {{selection}})
- Sensitive-data masking via configurable regex rules
- Exclusion patterns for files/content
- Modular core logic separate from UI
- VS Code plugin wrapper with Webview UI
- Quick Pick integration
- Relative timestamps
- Ban/Block specific content hashes
- Local storage with SQLite
- Headless CLI for automation

## Stack
TypeScript, Node.js, SQLite, Tauri (optional desktop wrapper), VS Code Extension API

## Becoming a plugin
Core logic resides in `@sentry-clip/core` (pure Node.js/TS). The VS Code plugin (`packages/vscode-plugin`) imports the core, bridges VS Code APIs (`vscode.window`, `vscode.extensions`) to the core, and renders the UI via a Webview. This separation allows the core to be reused in a Tauri desktop app or other tools without VS Code dependencies.

## Steps
- [x] 1. Initialize monorepo with `packages/core` and `packages/vscode-plugin`, add Vitest, TypeScript, and SQLite, then run `npm test` to verify setup
- [x] 2. Implement core data models (Clip, Snippet, MaskRule, Pin) and export types, verify with `node -e "require('./packages/core/dist/models')"`
- [x] 3. Build storage layer with SQLite indexing for search, test persistence and query speed via `npm run test:storage`
- [x] 4. Develop sensitive-data masking engine with regex support and test against sample PII tokens via `npm run test:masking`
- [x] 5. Create snippet engine with placeholder resolution (e.g., {{date}}, {{cursor}}) and test dynamic rendering via `npm run test:snippets`
- [x] 6. Implement history manager with pinning, max limits, and exclusion globs, verify logic via `npm run test:history`
- [x] 7. Expose core via CLI interface (`npx sentry-clip`) and test list/search commands to ensure headless operation
- [x] 8. Scaffold VS Code plugin package, add `package.json` contributions, and verify build with `npm run vscode:package`
- [x] 9. Integrate core into plugin by wrapping commands and connecting to VS Code Quick Pick, test via `npm run vscode:test`
- [x] 10. Build Webview UI with search bar, clip list, and pin toggle, verify rendering via `npm run vscode:test-ui`
- [x] 11. Add masking preview and snippet placeholder editor in Webview, test UI interactions via `npm run vscode:test-ui-masking`
- [x] 12. Implement global hotkey and `Ctrl+Shift+V` Quick Pick flow, test shortcut binding via `npm run vscode:test-quickpick`
- [x] 13. Map VS Code settings to core configuration, test dynamic updates via `npm run vscode:test-config`
- [!] 14. Fix Webview message handling and data flow: Remove duplicate message listeners, fix the infinite reload loop by ensuring initial data is sent correctly without triggering a page rebuild, and fix the unsafe content policy header in `packages/vscode-plugin/src/webview.ts`.
- [x] 15. Implement relative timestamps and hover previews: Add `requestTimestamps` handler in the extension, fix the browser-side TypeScript syntax error in the webview script, and implement the relative time formatting and hover tooltip logic in the Webview UI.
- [x] 16. Add status bar integration and final UI polish: Create the status bar item to show clipboard status, integrate it with the core history manager, and ensure all UI elements (masking preview, snippet placeholders) render correctly with proper escaping.
- [x] 17. Verify final UI via `npm run vscode:test-ui-final`: Run the final verification script to ensure all UI components, interactions, and integrations work as expected.
- [ ] 18. Write README with run instructions, feature list, and step-by-step guide to convert core into a standalone desktop plugin
