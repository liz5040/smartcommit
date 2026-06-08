import * as vscode from 'vscode';

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    let apiKey = await context.secrets.get('groq-api-key');
    if (apiKey) {return apiKey;}

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

    await context.secrets.store('groq-api-key', entered);
    return entered;
}