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
            vscode.window.showErrorMessage('No staged changes found — run git add first');
            return;
        }

        // Step 3 — Show loading message
        vscode.window.showInformationMessage('SmartCommit: Generating commit message...');

        // Step 4 — Call Groq API
        try {
            const apiKey = await context.secrets.get('groq-api-key');

			if (!apiKey) {
				const entered = await vscode.window.showInputBox({
					prompt: 'Enter your Groq API key to use SmartCommit',
					password: true,
					ignoreFocusOut: true,
					placeHolder: 'gsk_...'
				});
				if (!entered) {
					vscode.window.showErrorMessage('No API key provided!');
					return;
				}
				await context.secrets.store('groq-api-key', entered);
			}

			const storedKey = await context.secrets.get('groq-api-key');
			const groq = new Groq({
				apiKey: storedKey || ''
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
                        - Respond with ONLY the commit message
                        - No asterisks, backticks, or markdown formatting`
                    },
                    {
                        role: 'user',
                        content: `Write a commit message for this git diff:\n\n${diff}`
                    }
                ]
            });

            // Step 5 — Get commit message
            const aiMessage = response.choices[0]?.message?.content?.trim();

            if (!aiMessage) {
                vscode.window.showErrorMessage('Groq returned an empty response!');
                return;
            }

            // Step 6 — Show in EDITABLE input box
            const editedMessage = await vscode.window.showInputBox({
                prompt: 'Edit your commit message if needed, then press Enter to commit',
                value: aiMessage,
                placeHolder: 'Commit message...',
                ignoreFocusOut: true
            });

            // Step 7 — User cancelled
            if (editedMessage === undefined) {
                vscode.window.showInformationMessage('SmartCommit: Commit cancelled.');
                return;
            }

            // Step 8 — Show the accepted message
            vscode.window.showInformationMessage(`SmartCommit ready to commit: "${editedMessage}"`);

        } catch (error) {
            vscode.window.showErrorMessage(`SmartCommit error: ${error}`);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}