import js from "@eslint/js";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "*.config.js",
      "pnpm-lock.yaml",
      "**/*.ts",  // Ignore TypeScript files - we use tsc for checking
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "off",  // Disabled - TypeScript catches this
      "no-console": "off",
    },
  },
];
