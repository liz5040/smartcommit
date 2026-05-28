import * as vscode from 'vscode';
import simpleGit from 'simple-git';
import Groq from 'groq-sdk';

export function activate(context: vscode.ExtensionContext) {

    console.log('SmartCommit is now active!');

    const disposable = vscode.commands.registerCommand('smartcommit.generateCommit', async () => {

        // Step 1 — Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found!');
            return;
        }

        // Step 2 — Read staged git diff
        const git = simpleGit(workspaceFolder);
        const diff = await git.diff(['--staged']);

        if (!diff) {
            vscode.window.showErrorMessage('No staged files found! Please run git add first.');
            return;
        }

        // Step 3 — Show loading message
        vscode.window.showInformationMessage('SmartCommit: Generating commit message...');

        // Step 4 — Call Groq API
        try {
            const groq = new Groq({
                apiKey: process.env.GROQ_API_KEY || ''
            });

            const response = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `You are a helpful assistant that writes git commit messages.
                        Given a git diff, write a single concise commit message following 
                        Conventional Commits format (feat/fix/chore/docs etc).
                        Rules:
                        - Maximum 72 characters
                        - Use present tense
                        - Be specific about what changed
                        - Respond with ONLY the commit message, nothing else`
                    },
                    {
                        role: 'user',
                        content: `Write a commit message for this git diff:\n\n${diff}`
                    }
                ]
            });

            // Step 5 — Get the commit message from response
            const commitMessage = response.choices[0]?.message?.content?.trim();

            if (!commitMessage) {
                vscode.window.showErrorMessage('Groq returned an empty response!');
                return;
            }

            // Step 6 — Show it in output panel
            const outputChannel = vscode.window.createOutputChannel('SmartCommit');
            outputChannel.show();
            outputChannel.appendLine('--- AI Generated Commit Message ---');
            outputChannel.appendLine(commitMessage);
            outputChannel.appendLine('--- End ---');

            // Step 7 — Show it as a notification too
            vscode.window.showInformationMessage(`SmartCommit: ${commitMessage}`);

        } catch (error) {
            vscode.window.showErrorMessage(`Groq API error: ${error}`);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}