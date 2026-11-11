#!/usr/bin/env node
/**
 * Validates the VS Code extension package.json structure.
 * Used by `npm run vscode:package` after building.
 */
const { readFileSync, existsSync } = require('fs');
const { resolve, dirname } = require('path');

const pkgPath = resolve(__dirname, '..', 'packages/vscode-plugin/package.json');
const pkgDir = resolve(__dirname, '..', 'packages/vscode-plugin');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

const required = ['publisher', 'main', 'engines'];
for (const field of required) {
  if (!pkg[field]) {
    console.error(`ERROR: Missing required field: ${field}`);
    process.exit(1);
  }
}

if (!pkg.engines.vscode) {
  console.error('ERROR: Missing engines.vscode');
  process.exit(1);
}

// activationEvents can be empty (extension activates on command)

if (!pkg.contributes) {
  console.error('ERROR: Missing contributes');
  process.exit(1);
}

// Check that the built extension file exists (main is relative to extension dir)
const extPath = resolve(pkgDir, pkg.main);
if (!existsSync(extPath)) {
  console.error(`ERROR: Built extension not found at ${extPath}`);
  process.exit(1);
}

console.log('VS Code extension package.json is valid:', pkg.name, pkg.version);
console.log('  - publisher:', pkg.publisher);
console.log('  - main:', pkg.main);
console.log('  - engines.vscode:', pkg.engines.vscode);
console.log('  - activationEvents:', pkg.activationEvents);
console.log('  - commands:', pkg.contributes.commands?.length || 0);
console.log('  - keybindings:', pkg.contributes.keybindings?.length || 0);
console.log('  - configuration properties:', Object.keys(pkg.contributes.configuration?.properties || {}).length);
console.log('  - built extension exists:', existsSync(extPath));
console.log('Validation passed.');
