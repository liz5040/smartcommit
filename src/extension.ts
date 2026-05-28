import * as vscode from 'vscode';
import simpleGit from 'simple-git';
import Groq from 'groq-sdk';

class SmartCommitPanel implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        this.refresh();

        // Auto refresh when git state changes
        const watcher = vscode.workspace.createFileSystemWatcher('**/.git/index');
        watcher.onDidChange(() => this.refresh());
        watcher.onDidCreate(() => this.refresh());
        this._context.subscriptions.push(watcher);

        // Listen for messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'generate') {
                await this.generateCommit();
            }
            if (message.command === 'generatePR') {
                await this.generatePR();
            }
        });
    }

    async refresh() {
        if (!this._view) return;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceFolder) {
            this._view.webview.html = this.getHtml('No workspace open', [], 0);
            return;
        }

        try {
            const git = simpleGit(workspaceFolder);
            const branchResult = await git.branch();
            const branch = branchResult.current;
            const status = await git.status();
            const stagedFiles = status.staged;
            const unstagedCount = status.modified.length + status.not_added.length;
            this._view.webview.html = this.getHtml(branch, stagedFiles, unstagedCount);
        } catch (error) {
            this._view.webview.html = this.getHtml('No git repo found', [], 0);
        }
    }

    getHtml(branch: string, stagedFiles: string[], unstagedCount: number) {
        const fileItems = stagedFiles.map(f => `
            <div class="file-item">
                <span class="badge">M</span>
                <span class="file-name">${f}</span>
            </div>
        `).join('');

        return `<!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    padding: 12px;
                    margin: 0;
                }
                .section-label {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    margin-bottom: 6px;
                    margin-top: 14px;
                }
                .branch-badge {
                    background: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 3px 10px;
                    border-radius: 3px;
                    font-size: 12px;
                    display: inline-block;
                    margin-bottom: 4px;
                }
                .file-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 3px 0;
                    font-size: 12px;
                }
                .badge {
                    background: #e2c08d;
                    color: #1e1e1e;
                    font-size: 10px;
                    font-weight: bold;
                    padding: 1px 5px;
                    border-radius: 3px;
                    min-width: 14px;
                    text-align: center;
                }
                .empty {
                    color: var(--vscode-descriptionForeground);
                    font-size: 12px;
                    font-style: italic;
                }
                .unstaged {
                    color: var(--vscode-descriptionForeground);
                    font-size: 12px;
                    margin-top: 4px;
                }
                .btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 14px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                    width: 100%;
                    margin-top: 10px;
                }
                .btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .btn-secondary {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .btn-secondary:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                }
                .divider {
                    border: none;
                    border-top: 0.5px solid var(--vscode-widget-border);
                    margin: 12px 0;
                }
            </style>
        </head>
        <body>
            <div class="section-label">Branch</div>
            <div class="branch-badge">⎇ ${branch}</div>

            <hr class="divider"/>

            <div class="section-label">Staged files (${stagedFiles.length})</div>
            ${stagedFiles.length > 0 ? fileItems : '<div class="empty">No staged files</div>'}
            <div class="unstaged">${unstagedCount} unstaged change${unstagedCount !== 1 ? 's' : ''}</div>

            <button class="btn" onclick="generate()">✦ Generate Commit Message</button>
            <button class="btn btn-secondary" onclick="generatePR()">⎇ Generate PR Description</button>

            <script>
                const vscode = acquireVsCodeApi();
                function generate() {
                    vscode.postMessage({ command: 'generate' });
                }
                function generatePR() {
                    vscode.postMessage({ command: 'generatePR' });
                }
            </script>
        </body>
        </html>`;
    }

    async getApiKey(): Promise<string | undefined> {
        let apiKey = await this._context.secrets.get('groq-api-key');
        if (!apiKey) {
            const entered = await vscode.window.showInputBox({
                prompt: 'Enter your Groq API key to use SmartCommit',
                password: true,
                ignoreFocusOut: true,
                placeHolder: 'gsk_...'
            });
            if (!entered) {
                vscode.window.showErrorMessage('No API key provided!');
                return undefined;
            }
            await this._context.secrets.store('groq-api-key', entered);
            apiKey = entered;
        }
        return apiKey;
    }

    async generateCommit() {
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

        vscode.window.showInformationMessage('SmartCommit: Generating commit message...');

        try {
            const apiKey = await this.getApiKey();
            if (!apiKey) return;

            const groq = new Groq({ apiKey });

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

            const aiMessage = response.choices[0]?.message?.content?.trim();
            if (!aiMessage) {
                vscode.window.showErrorMessage('Groq returned an empty response!');
                return;
            }

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

            await git.commit(editedMessage);
            vscode.window.showInformationMessage(`✅ Committed: "${editedMessage}"`);
            this.refresh();

        } catch (error) {
            vscode.window.showErrorMessage(`SmartCommit error: ${error}`);
        }
    }

    async generatePR() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found!');
            return;
        }

        try {
            const git = simpleGit(workspaceFolder);

            // Get current branch
            const branchResult = await git.branch();
            const branch = branchResult.current;

            // Get last 10 commits
            const log = await git.log(['-10']);
            const commits = log.all.map(c => `- ${c.message}`).join('\n');

            // Get changed files
            const diff = await git.diff(['main...HEAD', '--name-only']);
            const changedFiles = diff.split('\n').filter(f => f.trim()).map(f => `- ${f}`).join('\n');

            vscode.window.showInformationMessage('SmartCommit: Generating PR description...');

            const apiKey = await this.getApiKey();
            if (!apiKey) return;

            const groq = new Groq({ apiKey });

            const response = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `You are a helpful assistant that writes Pull Request descriptions.
                        Write a professional PR description in Markdown format with these sections:
                        ## Title
                        ## Summary
                        ## Changes
                        ## Test Notes
                        Be concise and specific.`
                    },
                    {
                        role: 'user',
                        content: `Write a PR description for:
                        Branch: ${branch}
                        
                        Recent commits:
                        ${commits}
                        
                        Changed files:
                        ${changedFiles}`
                    }
                ]
            });

            const prDescription = response.choices[0]?.message?.content?.trim();
            if (!prDescription) {
                vscode.window.showErrorMessage('Groq returned an empty response!');
                return;
            }

            // Open in new editor tab
            
            const doc = await vscode.workspace.openTextDocument({
                content: prDescription,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);

            // Copy to clipboard button
            const action = await vscode.window.showInformationMessage(
                '✅ PR Description generated!',
                'Copy to Clipboard'
            );

            if (action === 'Copy to Clipboard') {
                await vscode.env.clipboard.writeText(prDescription);
                vscode.window.showInformationMessage('📋 Copied to clipboard!');
            }

                    } catch (error) {
                        vscode.window.showErrorMessage(`SmartCommit error: ${error}`);
                    }
                }
            }

export function activate(context: vscode.ExtensionContext) {
    console.log('SmartCommit is now active!');

    const provider = new SmartCommitPanel(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('smartcommit.sidebar', provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('smartcommit.generateCommit', async () => {
            await provider.generateCommit();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('smartcommit.generatePR', async () => {
            await provider.generatePR();
        })
    );
}

export function deactivate() {}