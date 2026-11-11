import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('sentry-clip.showHistory', () => {
    vscode.window.showInformationMessage('Sentry Clip: Show Clipboard History');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
