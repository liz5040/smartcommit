import Groq from 'groq-sdk';

export class AIService {
    private groq: Groq;

    constructor(apiKey: string) {
        this.groq = new Groq({ apiKey });
    }

    async generateSingleCommit(diff: string): Promise<string | undefined> {
        const response = await this.groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: 'You are a helpful assistant that writes git commit messages.\nYou MUST follow Conventional Commits format exactly.\nFormat: <type>: <description>\nTypes: feat, fix, chore, docs, style, refactor, test\nRules:\n- MUST start with type prefix\n- MAXIMUM 72 characters\n- Present tense\n- No asterisks, backticks, or markdown\n- Respond with ONLY the commit message' },
                { role: 'user', content: `Write a commit message for this diff:\n\n${diff.substring(0, 3000)}` }
            ]
        });
        return response.choices[0]?.message?.content?.trim();
    }

    async generate3CommitOptions(diff: string): Promise<string | undefined> {
        const response = await this.groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: 'Generate exactly 3 commit message options:\nCONVENTIONAL: feat:/fix:/chore: prefix, under 72 chars\nSHORT: simple imperative, no prefix, under 50 chars\nDESCRIPTIVE: full sentence, under 72 chars\nRespond ONLY in this format:\nCONVENTIONAL: <message>\nSHORT: <message>\nDESCRIPTIVE: <message>' },
                { role: 'user', content: `Generate 3 options for this diff:\n\n${diff.substring(0, 3000)}` }
            ]
        });
        return response.choices[0]?.message?.content?.trim();
    }

    async generatePrDescription(branch: string, commits: string, files: string): Promise<string | undefined> {
        const response = await this.groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: 'Write a professional PR description in Markdown with sections: ## Title, ## Summary, ## Changes, ## Test Notes' },
                { role: 'user', content: `Branch: ${branch}\nCommits:\n${commits}\nChanged files:\n${files}` }
            ]
        });
        return response.choices[0]?.message?.content?.trim();
    }
}