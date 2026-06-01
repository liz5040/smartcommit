import * as vscode from 'vscode';
import simpleGit from 'simple-git';

export function activate(context: vscode.ExtensionContext) {

    console.log('SmartCommit is now active!');

    const disposable = vscode.commands.registerCommand('smartcommit.generateCommit', async () => {
        
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found!');
            return;
        }

        const git = simpleGit(workspaceFolder);
        const diff = await git.diff(['--staged']);

        if (!diff) {
            vscode.window.showErrorMessage('No staged changes found — run git add first');
            return;
        }

        const outputChannel = vscode.window.createOutputChannel('SmartCommit');
        outputChannel.show();
        outputChannel.appendLine('--- Staged Git Diff ---');
        outputChannel.appendLine(diff);
        outputChannel.appendLine('--- End of Diff ---');

        vscode.window.showInformationMessage('Git diff read successfully!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}