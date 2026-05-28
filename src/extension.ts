import * as vscode from 'vscode';
import simpleGit from 'simple-git';

export function activate(context: vscode.ExtensionContext) {

    console.log('SmartCommit is now active!');

    const disposable = vscode.commands.registerCommand('smartcommit.generateCommit', async () => {
        
        // Step 1 — Get the current workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found!');
            return;
        }

        // Step 2 — Connect to git in that folder
        const git = simpleGit(workspaceFolder);

        // Step 3 — Read the staged git diff
        const diff = await git.diff(['--staged']);

        // Step 4 — Check if anything is staged
        if (!diff) {
            vscode.window.showErrorMessage('No staged files found! Please run git add first.');
            return;
        }

        // Step 5 — Show the diff in VS Code output panel
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