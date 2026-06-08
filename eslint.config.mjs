import typescriptEslint from "typescript-eslint";

export default [
    // BUCKET 1: Tell ESLint to completely ignore compiled artifacts
    {
        ignores: ["out/**", "dist/**", "node_modules/**"]
    },
    {
        files: ["**/*.ts", "**/*.mjs"],
    }, 
    {
        plugins: {
            "@typescript-eslint": typescriptEslint.plugin,
        },

        languageOptions: {
            parser: typescriptEslint.parser,
            ecmaVersion: 2022,
            sourceType: "module",
        },

        rules: {
            "no-console": "error",
            "max-lines-per-function": ["warn", { "max": 30, "skipBlankLines": true, "skipComments": true }],

            // BUCKET 2 & 3: Refined naming convention rule
            "@typescript-eslint/naming-convention": [
                "error",
                { 
                    "selector": "default", 
                    "format": ["camelCase"],
                    // Allows leading underscores for private fields/parameters
                    "leadingUnderscore": "allow" 
                },
                { "selector": "import", "format": ["camelCase", "PascalCase"] },
                { "selector": "variable", "format": ["camelCase", "UPPER_CASE"], "leadingUnderscore": "allow" },
                { "selector": "typeLike", "format": ["PascalCase"] },
                // BUCKET 2: Safely allow hyphens/quotes in configuration keys
                { "selector": "objectLiteralProperty", "format": null }
            ],

            "curly": "warn",
            "eqeqeq": "warn",
            "no-throw-literal": "warn",
            "semi": "warn",
        },
    }
];