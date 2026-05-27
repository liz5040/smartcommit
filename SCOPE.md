# SmartCommit — Project Scope
**Intern:** Liz Maria Biju  
**Internship:** 4Labs | 26 May – 04 July 2026  
**Project:** SmartCommit — AI-Powered VS Code Extension

---

## 1. Commands

| Command | What it does |
|---|---|
| `smartcommit.generateCommit` | Reads staged diff, calls Groq, shows commit message |
| `smartcommit.regenerate` | Calls Groq again for a different message |
| `smartcommit.commitNow` | Runs git commit with the accepted message |
| `smartcommit.generatePR` | Generates PR description from branch + commits |
| `smartcommit.openPanel` | Opens the SmartCommit sidebar panel |

---

## 2. UI Surfaces

### Sidebar Panel (Webview)
- Branch name at the top
- List of staged files with M/A/D status badges
- AI generated commit message in an editable text box
- Commit button
- Regenerate button
- PR description section below

### Quick Pick Dropdown
- Shows 3 AI generated commit message options
- User picks one
- That message gets committed

### Input Box
- Editable commit message
- User can tweak before committing

### Notifications
- Success: "Committed successfully!"
- Error: "No staged files found"
- Error: "Groq API unavailable"

---

## 3. Groq Prompt Templates

### Commit Message Prompt
You are a helpful assistant that writes git commit messages.
Given the following git diff, write a single concise commit
message following the Conventional Commits format
(feat/fix/chore/docs etc).

Rules:
- Maximum 72 characters
- Use present tense
- Be specific about what changed

Git diff:
[DIFF GOES HERE]

Respond with only the commit message, nothing else.

### PR Description Prompt
You are a helpful assistant that writes Pull Request descriptions.
Given the branch name and recent commits, write a short PR
description with a title, 2-3 sentence summary, and bullet
list of changes.

Branch: [BRANCH NAME]
Commits: [COMMIT LIST]

Respond in Markdown format.

---

## 4. Error States

| Error | What the user sees |
|---|---|
| No git repo in folder | "No git repository found in this workspace" |
| No staged files | "Please stage your files first using git add" |
| Groq API fails | "AI service unavailable, please try again" |
| Network timeout | "Connection timed out, check your internet" |
| Rate limit hit | "Too many requests, please wait a moment" |
| Empty diff | "No changes detected in staged files" |

---

## 5. Out of Scope
- GitHub API integration
- Push to remote
- Support for multiple AI providers
- Settings page (may add later)