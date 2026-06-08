import * as vscode from 'vscode';
import simpleGit, { SimpleGit } from 'simple-git';

export class GitService {
    private git: SimpleGit;

    constructor(public readonly workspaceRoot: string) {
        this.git = simpleGit(workspaceRoot);
    }

    async getStatus() {
        return await this.git.status();
    }

    async getBranch() {
        return await this.git.branch();
    }

    async getLog(count = '-10') {
        const log = await this.git.log([count]);
        return log.all;
    }

    async getStagedDiff(): Promise<string> {
        return await this.git.diff(['--staged']);
    }

    async getPrDiff(): Promise<string> {
        return await this.git.diff(['main...HEAD', '--name-only']);
    }

    async showCommitDiff(hash: string): Promise<string> {
        return await this.git.raw(['show', '--patch', '--unified=3', hash]);
    }

    async executeCommit(message: string) {
        return await this.git.commit(message);
    }
}