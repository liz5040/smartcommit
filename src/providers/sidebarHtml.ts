import * as vscode from 'vscode';

export function getSidebarHtml(webview: vscode.Webview): string {
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