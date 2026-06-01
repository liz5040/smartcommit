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

        // Step 2 — Check git repo
        let git;
        try {
            git = simpleGit(workspaceFolder);
            await git.status();
        } catch (error) {
            vscode.window.showErrorMessage('No git repository found — open a git repository first');
            return;
        }

        // Step 3 — Read staged diff
        const diff = await git.diff(['--staged']);
        if (!diff) {
            vscode.window.showErrorMessage('No staged changes found — run git add first');
            return;
        }

        vscode.window.showInformationMessage('SmartCommit: Generating commit message...');

        try {
            // Step 4 — Get API key
            let apiKey = await context.secrets.get('groq-api-key');
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
                apiKey = entered;
            }

            // Step 5 — Call Groq
            const groq = new Groq({ apiKey });
            const response = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `You are a helpful assistant that writes git commit messages.
                        You MUST follow Conventional Commits format exactly.
                        Format: <type>: <description>
                        Types: feat, fix, chore, docs, style, refactor, test
                        Rules:
                        - MUST start with type prefix
                        - MAXIMUM 72 characters
                        - Present tense
                        - No asterisks, backticks, or markdown
                        - Respond with ONLY the commit message`
                    },
                    {
                        role: 'user',
                        content: `Write a commit message for this diff:\n\n${diff.substring(0, 3000)}`
                    }
                ]
            });

            const aiMessage = response.choices[0]?.message?.content?.trim();
            if (!aiMessage) {
                vscode.window.showErrorMessage('Groq returned an empty response!');
                return;
            }

            // Step 6 — Show editable input box
            const editedMessage = await vscode.window.showInputBox({
                prompt: 'Edit your commit message if needed, then press Enter to commit',
                value: aiMessage,
                placeHolder: 'Commit message...',
                ignoreFocusOut: true
            });

            if (editedMessage === undefined) {
                vscode.window.showInformationMessage('SmartCommit: Commit cancelled.');
                return;
            }

            // Step 7 — Execute git commit
            await git.commit(editedMessage);
            vscode.window.showInformationMessage(`✅ Committed: "${editedMessage}"`);

        } catch (error: any) {
            if (error?.status === 429) {
                vscode.window.showErrorMessage('Rate limit reached — please wait a moment and try again');
            } else if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
                vscode.window.showErrorMessage('Connection failed — check your internet and try again');
            } else if (error?.status >= 500) {
                vscode.window.showErrorMessage('Groq API is unavailable — please try again later');
            } else {
                vscode.window.showErrorMessage(`SmartCommit error: ${error}`);
            }
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}