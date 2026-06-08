import * as vscode from 'vscode';
import { SmartCommitPanel } from './providers/sidebarProvider';

export function activate(context: vscode.ExtensionContext) {
    vscode.window.setStatusBarMessage('SmartCommit is now active!');

    const provider = new SmartCommitPanel(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('smartcommit.sidebar', provider),
        vscode.commands.registerCommand('smartcommit.generateCommit', () => provider.generateCommit()),
        vscode.commands.registerCommand('smartcommit.generatePR', () => provider.generatePR()),
        vscode.commands.registerCommand('smartcommit.generate3Options', () => provider.generate3Options())
    );
}

export function deactivate() {}