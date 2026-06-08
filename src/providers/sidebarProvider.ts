import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { AIService } from '../services/aiService';
import { getApiKey } from '../utils/credentials';
import { getSidebarHtml } from './sidebarHtml';
export class SmartCommitPanel implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _context: vscode.ExtensionContext) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        this._view.webview.html = getSidebarHtml(webviewView.webview);
        setTimeout(() => this.loadData(), 100);

        const watcher = vscode.workspace.createFileSystemWatcher('**/.git/index');
        watcher.onDidChange(() => this.loadData());
        watcher.onDidCreate(() => this.loadData());
        this._context.subscriptions.push(watcher);

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg.command === 'generate') { await this.generateCommit(); }
            if (msg.command === 'generate3Options') { await this.generate3Options(); }
            if (msg.command === 'generatePR') { await this.generatePR(); }
            if (msg.command === 'showDiff') { await this.showCommitDiff(msg.hash); }
        });
    }

    private getWorkspaceFolder(): string | undefined {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    private async getGitService(): Promise<GitService | undefined> {
        const root = this.getWorkspaceFolder();
        if (!root) {return undefined;}
        const service = new GitService(root);
        try {
            await service.getStatus();
            return service;
        } catch {
            return undefined;
        }
    }

    async loadData() {
        if (!this._view) {return;}
        const git = await this.getGitService();
        if (!git) {
            this._view.webview.postMessage({ command: 'updateData', branch: 'No git repo', stagedFiles: [], unstagedCount: 0, commits: [] });
            return;
        }
        const branchResult = await git.getBranch();
        const status = await git.getStatus();
        const logCommits = await git.getLog();

        this._view.webview.postMessage({
            command: 'updateData',
            branch: branchResult.current,
            stagedFiles: status.staged,
            unstagedCount: status.modified.length + status.not_added.length,
            commits: logCommits.map(c => ({
                hash: c.hash, message: c.message, author: c.author_name, date: new Date(c.date).toLocaleDateString()
            }))
        });
    }

    async showCommitDiff(hash: string) {
        const git = await this.getGitService();
        if (!git || !hash) {return;}
        try {
            const diff = await git.showCommitDiff(hash);
            this._view?.webview.postMessage({ command: 'showDiffResult', diff: diff || 'No diff content' });
        } catch (err) {
            vscode.window.showErrorMessage(`Could not load diff: ${err}`);
        }
    }

    private async getStagedDiffOrAlert(git: GitService): Promise<string | undefined> {
        const diff = await git.getStagedDiff();
        if (!diff) {
            vscode.window.showErrorMessage('No staged changes found — run git add first');
            return undefined;
        }
        return diff;
    }

    async generateCommit() {
        const git = await this.getGitService();
        if (!git) { vscode.window.showErrorMessage('No active git repository!'); return; }
        const diff = await this.getStagedDiffOrAlert(git);
        if (!diff) {return;}

        vscode.window.showInformationMessage('SmartCommit: Generating commit message...');
        try {
            const key = await getApiKey(this._context);
            if (!key) {return;}
            const message = await new AIService(key).generateSingleCommit(diff);
            if (!message) {return;}

            const edited = await vscode.window.showInputBox({ prompt: 'Edit commit message', value: message, ignoreFocusOut: true });
            if (edited === undefined) {return;}

            await git.executeCommit(edited);
            vscode.window.showInformationMessage(`✅ Committed: "${edited}"`);
            await this.loadData();
        } catch (err: any) {
            this.handleApiError(err);
        }
    }

    async generate3Options() {
        const git = await this.getGitService();
        if (!git) { vscode.window.showErrorMessage('No active git repository!'); return; }
        const diff = await this.getStagedDiffOrAlert(git);
        if (!diff) {return;}

        vscode.window.showInformationMessage('SmartCommit: Generating 3 options...');
        try {
            const key = await getApiKey(this._context);
            if (!key) {return;}
            const raw = await new AIService(key).generate3CommitOptions(diff);
            if (!raw) {return;}

            const lines = raw.split('\n').filter(l => l.trim());
            const conv = lines.find(l => l.startsWith('CONVENTIONAL:'))?.replace('CONVENTIONAL:', '').trim() || '';
            const shrt = lines.find(l => l.startsWith('SHORT:'))?.replace('SHORT:', '').trim() || '';
            const desc = lines.find(l => l.startsWith('DESCRIPTIVE:'))?.replace('DESCRIPTIVE:', '').trim() || '';

            const selected = await vscode.window.showQuickPick(
                [{ label: conv, description: 'Conventional' }, { label: shrt, description: 'Short' }, { label: desc, description: 'Descriptive' }],
                { title: 'SmartCommit — Choose style' }
            );
            if (!selected) {return;}
            await git.executeCommit(selected.label);
            vscode.window.showInformationMessage(`✅ Committed: "${selected.label}"`);
            await this.loadData();
        } catch (err: any) {
            this.handleApiError(err);
        }
    }

    async generatePR() {
        const git = await this.getGitService();
        if (!git) {return;}
        try {
            const branch = (await git.getBranch()).current;
            const commits = (await git.getLog()).map(c => `- ${c.message}`).join('\n');
            const files = (await git.getPrDiff()).split('\n').filter(f => f.trim()).map(f => `- ${f}`).join('\n');

            vscode.window.showInformationMessage('SmartCommit: Generating PR description...');
            const key = await getApiKey(this._context);
            if (!key) {return;}
            const desc = await new AIService(key).generatePrDescription(branch, commits, files);
            if (!desc) {return;}

            const doc = await vscode.workspace.openTextDocument({ content: desc, language: 'markdown' });
            await vscode.window.showTextDocument(doc);
            const action = await vscode.window.showInformationMessage('✅ PR Generated!', 'Copy');
            if (action === 'Copy') { await vscode.env.clipboard.writeText(desc); }
        } catch (err) {
            vscode.window.showErrorMessage(`SmartCommit error: ${err}`);
        }
    }

    private handleApiError(error: any) {
        if (error?.status === 429) { vscode.window.showErrorMessage('Rate limit reached — wait a moment'); }
        else if (error?.code === 'ENOTFOUND') { vscode.window.showErrorMessage('Connection failed — check internet'); }
        else { vscode.window.showErrorMessage(`SmartCommit error: ${error}`); }
    }

    

private getHtml(webview: vscode.Webview): string {
    return getSidebarHtml(webview);
}
    }
