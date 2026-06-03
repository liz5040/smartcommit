import * as vscode from 'vscode';
import * as path from 'path';
import simpleGit from 'simple-git';
import Groq from 'groq-sdk';

class SmartCommitPanel implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;
    private _commits: any[] = [];

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        this._view.webview.html = this.getHtml();
        setTimeout(() => this.loadData(), 100);

        const watcher = vscode.workspace.createFileSystemWatcher('**/.git/index');
        watcher.onDidChange(() => this.loadData());
        watcher.onDidCreate(() => this.loadData());
        this._context.subscriptions.push(watcher);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'generate') { await this.generateCommit(); }
            if (message.command === 'generate3Options') { await this.generate3Options(); }
            if (message.command === 'generatePR') { await this.generatePR(); }
            if (message.command === 'showDiff') { await this.showCommitDiff(message.hash); }
        });
    }

    async loadData() {
        if (!this._view) return;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            this._view.webview.postMessage({ command: 'updateData', branch: 'No workspace', stagedFiles: [], unstagedCount: 0, commits: [] });
            return;
        }

        try {
            const git = simpleGit(workspaceFolder);
            const branchResult = await git.branch();
            const branch = branchResult.current;
            const status = await git.status();
            const stagedFiles = status.staged;
            const unstagedCount = status.modified.length + status.not_added.length;
            const log = await git.log(['-10']);
            this._commits = [...log.all];

            this._view.webview.postMessage({
                command: 'updateData',
                branch,
                stagedFiles,
                unstagedCount,
                commits: this._commits.map(c => ({
                    hash: c.hash,
                    message: c.message,
                    author: c.author_name,
                    date: new Date(c.date).toLocaleDateString()
                }))
            });
        } catch (error) {
            this._view.webview.postMessage({ command: 'updateData', branch: 'No git repo', stagedFiles: [], unstagedCount: 0, commits: [] });
        }
    }

    async refresh() {
        await this.loadData();
    }

    async showCommitDiff(hash: string) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder || !hash) return;

        try {
            const git = simpleGit(workspaceFolder);
            const diff = await git.raw(['show', '--patch', '--unified=3', hash]);
            this._view?.webview.postMessage({
                command: 'showDiffResult',
                diff: diff || 'No diff content for this commit'
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Could not load diff: ${error}`);
        }
    }

    getHtml() {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
            <style>
                body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 12px; margin: 0; }
                .section-label { font-size: 11px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; margin-top: 14px; }
                .branch-badge { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 3px 10px; border-radius: 3px; font-size: 12px; display: inline-block; margin-bottom: 4px; }
                .file-item { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; }
                .badge { background: #e2c08d; color: #1e1e1e; font-size: 10px; font-weight: bold; padding: 1px 5px; border-radius: 3px; min-width: 14px; text-align: center; }
                .empty { color: var(--vscode-descriptionForeground); font-size: 12px; font-style: italic; }
                .unstaged { color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 4px; }
                .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 14px; border-radius: 3px; cursor: pointer; font-size: 12px; width: 100%; margin-top: 10px; }
                .btn:hover { background: var(--vscode-button-hoverBackground); }
                .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
                .divider { border: none; border-top: 0.5px solid var(--vscode-widget-border); margin: 12px 0; }
                .commit-item { padding: 6px 8px; margin-bottom: 4px; border-radius: 4px; cursor: pointer; border: 0.5px solid var(--vscode-widget-border); background: var(--vscode-editor-background); user-select: none; }
                .commit-item:hover { background: var(--vscode-list-hoverBackground); }
                .commit-item.active { border-color: var(--vscode-focusBorder); }
                .commit-msg { font-size: 12px; color: var(--vscode-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .commit-meta { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
                .diff-container { margin-top: 10px; display: none; }
                .diff-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
                .diff-title { font-size: 11px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.08em; }
                .toggle-row { display: flex; gap: 4px; }
                .toggle-btn { font-size: 10px; padding: 2px 8px; border-radius: 3px; border: 0.5px solid var(--vscode-widget-border); background: var(--vscode-editor-background); color: var(--vscode-foreground); cursor: pointer; }
                .toggle-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
                .loading { font-size: 11px; color: var(--vscode-descriptionForeground); font-style: italic; padding: 8px 0; }
            </style>
        </head>
        <body>
            <div class="section-label">Branch</div>
            <div class="branch-badge" id="branchBadge">⎇ loading...</div>

            <hr class="divider"/>

            <div class="section-label">Staged files (<span id="stagedCount">0</span>)</div>
            <div id="stagedFiles"><div class="empty">No staged files</div></div>
            <div class="unstaged" id="unstagedCount">0 unstaged changes</div>

            <button class="btn" id="generateBtn">✦ Generate Commit Message</button>
            <button class="btn btn-secondary" id="generate3Btn">⚡ Generate 3 Options</button>
            <button class="btn btn-secondary" id="generatePRBtn">⎇ Generate PR Description</button>

            <hr class="divider"/>

            <div class="section-label">Recent Commits</div>
            <div id="commitsList"><div class="empty">Loading...</div></div>

            <div class="diff-container" id="diffContainer">
                <hr class="divider"/>
                <div class="diff-header">
                    <span class="diff-title">Changes</span>
                    <div class="toggle-row">
                        <button class="toggle-btn active" id="unifiedBtn">Unified</button>
                        <button class="toggle-btn" id="sideBySideBtn">Side by Side</button>
                    </div>
                </div>
                <div id="loadingMsg" class="loading">Loading diff...</div>
                <div id="diffOutput"></div>
            </div>

            <script>
            (function() {
                const vscode = acquireVsCodeApi();
                let currentDiff = '';
                let currentView = 'unified';

                document.getElementById('generateBtn').addEventListener('click', function() { vscode.postMessage({ command: 'generate' }); });
                document.getElementById('generate3Btn').addEventListener('click', function() { vscode.postMessage({ command: 'generate3Options' }); });
                document.getElementById('generatePRBtn').addEventListener('click', function() { vscode.postMessage({ command: 'generatePR' }); });

                document.getElementById('unifiedBtn').addEventListener('click', function() {
                    currentView = 'unified';
                    document.getElementById('unifiedBtn').classList.add('active');
                    document.getElementById('sideBySideBtn').classList.remove('active');
                    renderDiff(currentDiff, currentView);
                });
                document.getElementById('sideBySideBtn').addEventListener('click', function() {
                    currentView = 'side-by-side';
                    document.getElementById('sideBySideBtn').classList.add('active');
                    document.getElementById('unifiedBtn').classList.remove('active');
                    renderDiff(currentDiff, currentView);
                });

                function renderDiff(diff, view) {
                    const outputBox = document.getElementById('diffOutput');
                    const loadingIndicator = document.getElementById('loadingMsg');

                    if (!diff) {
                        loadingIndicator.style.display = 'none';
                        outputBox.innerHTML = '<div class="empty">No changes found.</div>';
                        return;
                    }

                    loadingIndicator.style.display = 'none';
                    var lines = diff.split('\\n');

                    if (view === 'unified') {
                        var html = '<div style="font-family:monospace;font-size:11px;overflow-x:auto;">';
                        lines.forEach(function(line) {
                            var escaped = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                            if (line.startsWith('+') && !line.startsWith('+++')) {
                                html += '<div style="background:#1a3a1a;color:#73c991;padding:1px 4px;white-space:pre;">' + escaped + '</div>';
                            } else if (line.startsWith('-') && !line.startsWith('---')) {
                                html += '<div style="background:#3a1a1a;color:#f44747;padding:1px 4px;white-space:pre;">' + escaped + '</div>';
                            } else if (line.startsWith('@@')) {
                                html += '<div style="color:#569cd6;padding:1px 4px;white-space:pre;">' + escaped + '</div>';
                            } else {
                                html += '<div style="color:#888;padding:1px 4px;white-space:pre;">' + escaped + '</div>';
                            }
                        });
                        html += '</div>';
                        outputBox.innerHTML = html;
                    } else {
                        var leftHtml = '<div style="flex:1;overflow-x:auto;font-family:monospace;font-size:11px;">';
                        var rightHtml = '<div style="flex:1;overflow-x:auto;font-family:monospace;font-size:11px;">';
                        lines.forEach(function(line) {
                            var escaped = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                            if (line.startsWith('-') && !line.startsWith('---')) {
                                leftHtml += '<div style="background:#3a1a1a;color:#f44747;padding:1px 4px;white-space:pre;">' + escaped + '</div>';
                                rightHtml += '<div style="padding:1px 4px;min-height:18px;"></div>';
                            } else if (line.startsWith('+') && !line.startsWith('+++')) {
                                leftHtml += '<div style="padding:1px 4px;min-height:18px;"></div>';
                                rightHtml += '<div style="background:#1a3a1a;color:#73c991;padding:1px 4px;white-space:pre;">' + escaped + '</div>';
                            } else {
                                var l = '<div style="color:#888;padding:1px 4px;white-space:pre;">' + escaped + '</div>';
                                leftHtml += l; rightHtml += l;
                            }
                        });
                        leftHtml += '</div>'; rightHtml += '</div>';
                        outputBox.innerHTML = '<div style="display:flex;gap:4px;">' + leftHtml + rightHtml + '</div>';
                    }

                    document.getElementById('diffContainer').scrollIntoView({ behavior: 'smooth' });
                }

                function attachCommitListeners() {
                    document.querySelectorAll('.commit-item').forEach(function(el) {
                        el.addEventListener('click', function() {
                            var hash = el.getAttribute('data-hash');
                            document.querySelectorAll('.commit-item').forEach(function(c) { c.classList.remove('active'); });
                            el.classList.add('active');
                            document.getElementById('diffContainer').style.display = 'block';
                            document.getElementById('loadingMsg').style.display = 'block';
                            document.getElementById('diffOutput').innerHTML = '';
                            currentDiff = '';
                            vscode.postMessage({ command: 'showDiff', hash: hash });
                        });
                    });
                }

                window.addEventListener('message', function(event) {
                    var message = event.data;

                    if (message.command === 'updateData') {
                        document.getElementById('branchBadge').textContent = '⎇ ' + message.branch;
                        document.getElementById('stagedCount').textContent = message.stagedFiles.length;

                        document.getElementById('stagedFiles').innerHTML = message.stagedFiles.length > 0
                            ? message.stagedFiles.map(function(f) {
                                return '<div class="file-item"><span class="badge">M</span><span>' + f + '</span></div>';
                            }).join('')
                            : '<div class="empty">No staged files</div>';

                        document.getElementById('unstagedCount').textContent = message.unstagedCount + ' unstaged changes';

                        if (message.commits.length > 0) {
                            document.getElementById('commitsList').innerHTML = message.commits.map(function(c) {
                                return '<div class="commit-item" data-hash="' + c.hash + '"><div class="commit-msg">' + c.message + '</div><div class="commit-meta">' + c.author + ' · ' + c.date + '</div></div>';
                            }).join('');
                            attachCommitListeners();
                        } else {
                            document.getElementById('commitsList').innerHTML = '<div class="empty">No commits yet</div>';
                        }
                    }

                    if (message.command === 'showDiffResult') {
                        currentDiff = message.diff;
                        renderDiff(currentDiff, currentView);
                    }
                });
            })();
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
        if (!workspaceFolder) { vscode.window.showErrorMessage('No workspace folder found!'); return; }

        let git;
        try {
            git = simpleGit(workspaceFolder);
            await git.status();
        } catch (error) {
            vscode.window.showErrorMessage('No git repository found — open a git repository first');
            return;
        }

        const diff = await git.diff(['--staged']);
        if (!diff) { vscode.window.showErrorMessage('No staged changes found — run git add first'); return; }

        vscode.window.showInformationMessage('SmartCommit: Generating commit message...');

        try {
            const apiKey = await this.getApiKey();
            if (!apiKey) return;

            const groq = new Groq({ apiKey });
            const response = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: `You are a helpful assistant that writes git commit messages.
                        You MUST follow Conventional Commits format exactly.
                        Format: <type>: <description>
                        Types: feat, fix, chore, docs, style, refactor, test
                        Rules:
                        - MUST start with type prefix
                        - MAXIMUM 72 characters
                        - Present tense
                        - No asterisks, backticks, or markdown
                        - Respond with ONLY the commit message` },
                    { role: 'user', content: `Write a commit message for this diff:\n\n${diff.substring(0, 3000)}` }
                ]
            });

            const aiMessage = response.choices[0]?.message?.content?.trim();
            if (!aiMessage) { vscode.window.showErrorMessage('Groq returned an empty response!'); return; }

            const editedMessage = await vscode.window.showInputBox({
                prompt: 'Edit your commit message if needed, then press Enter to commit',
                value: aiMessage, placeHolder: 'Commit message...', ignoreFocusOut: true
            });

            if (editedMessage === undefined) { vscode.window.showInformationMessage('SmartCommit: Commit cancelled.'); return; }

            await git.commit(editedMessage);
            vscode.window.showInformationMessage(`✅ Committed: "${editedMessage}"`);
            this.refresh();

        } catch (error: any) {
            if (error?.status === 429) { vscode.window.showErrorMessage('Rate limit reached — please wait a moment and try again'); }
            else if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') { vscode.window.showErrorMessage('Connection failed — check your internet and try again'); }
            else if (error?.status >= 500) { vscode.window.showErrorMessage('Groq API is unavailable — please try again later'); }
            else { vscode.window.showErrorMessage(`SmartCommit error: ${error}`); }
        }
    }

    async generate3Options() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) { vscode.window.showErrorMessage('No workspace folder found!'); return; }

        let git;
        try {
            git = simpleGit(workspaceFolder);
            await git.status();
        } catch (error) {
            vscode.window.showErrorMessage('No git repository found — open a git repository first');
            return;
        }

        const diff = await git.diff(['--staged']);
        if (!diff) { vscode.window.showErrorMessage('No staged changes found — run git add first'); return; }

        vscode.window.showInformationMessage('SmartCommit: Generating 3 options...');

        try {
            const apiKey = await this.getApiKey();
            if (!apiKey) return;

            const groq = new Groq({ apiKey });
            const response = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: `Generate exactly 3 commit message options:
                        CONVENTIONAL: feat:/fix:/chore: prefix, under 72 chars
                        SHORT: simple imperative, no prefix, under 50 chars
                        DESCRIPTIVE: full sentence, under 72 chars
                        Respond ONLY in this format:
                        CONVENTIONAL: <message>
                        SHORT: <message>
                        DESCRIPTIVE: <message>` },
                    { role: 'user', content: `Generate 3 options for this diff:\n\n${diff.substring(0, 3000)}` }
                ]
            });

            const raw = response.choices[0]?.message?.content?.trim();
            if (!raw) { vscode.window.showErrorMessage('Groq returned an empty response!'); return; }

            const lines = raw.split('\n').filter((l: string) => l.trim());
            const conventional = lines.find((l: string) => l.startsWith('CONVENTIONAL:'))?.replace('CONVENTIONAL:', '').trim() || '';
            const short = lines.find((l: string) => l.startsWith('SHORT:'))?.replace('SHORT:', '').trim() || '';
            const descriptive = lines.find((l: string) => l.startsWith('DESCRIPTIVE:'))?.replace('DESCRIPTIVE:', '').trim() || '';

            if (!conventional || !short || !descriptive) { vscode.window.showErrorMessage('Could not parse 3 options — please try again'); return; }

            const selected = await vscode.window.showQuickPick(
                [{ label: conventional, description: 'Conventional Commits' }, { label: short, description: 'Short Imperative' }, { label: descriptive, description: 'Descriptive' }],
                { placeHolder: 'Pick a commit message style', title: 'SmartCommit — Choose your commit message' }
            );

            if (!selected) { vscode.window.showInformationMessage('SmartCommit: Cancelled.'); return; }

            await git.commit(selected.label);
            vscode.window.showInformationMessage(`✅ Committed: "${selected.label}"`);
            this.refresh();

        } catch (error: any) {
            if (error?.status === 429) { vscode.window.showErrorMessage('Rate limit reached — please wait a moment and try again'); }
            else { vscode.window.showErrorMessage(`SmartCommit error: ${error}`); }
        }
    }

    async generatePR() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) { vscode.window.showErrorMessage('No workspace folder found!'); return; }

        try {
            const git = simpleGit(workspaceFolder);
            const branchResult = await git.branch();
            const branch = branchResult.current;
            const log = await git.log(['-10']);
            const commits = log.all.map((c: any) => `- ${c.message}`).join('\n');
            const diff = await git.diff(['main...HEAD', '--name-only']);
            const changedFiles = diff.split('\n').filter((f: string) => f.trim()).map((f: string) => `- ${f}`).join('\n');

            vscode.window.showInformationMessage('SmartCommit: Generating PR description...');

            const apiKey = await this.getApiKey();
            if (!apiKey) return;

            const groq = new Groq({ apiKey });
            const response = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: `Write a professional PR description in Markdown with sections: ## Title, ## Summary, ## Changes, ## Test Notes` },
                    { role: 'user', content: `Branch: ${branch}\nCommits:\n${commits}\nChanged files:\n${changedFiles}` }
                ]
            });

            const prDescription = response.choices[0]?.message?.content?.trim();
            if (!prDescription) { vscode.window.showErrorMessage('Groq returned an empty response!'); return; }

            const doc = await vscode.workspace.openTextDocument({ content: prDescription, language: 'markdown' });
            await vscode.window.showTextDocument(doc);

            const action = await vscode.window.showInformationMessage('✅ PR Description generated!', 'Copy to Clipboard');
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

    context.subscriptions.push(vscode.window.registerWebviewViewProvider('smartcommit.sidebar', provider));
    context.subscriptions.push(vscode.commands.registerCommand('smartcommit.generateCommit', async () => { await provider.generateCommit(); }));
    context.subscriptions.push(vscode.commands.registerCommand('smartcommit.generatePR', async () => { await provider.generatePR(); }));
    context.subscriptions.push(vscode.commands.registerCommand('smartcommit.generate3Options', async () => { await provider.generate3Options(); }));
}

export function deactivate() {}