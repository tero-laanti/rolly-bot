const js = require("@eslint/js");
const globals = require("globals");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    languageOptions: {
      globals: globals.node,
    },
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/shared/economy.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/shared/economy"],
              message: "Import economy helpers from src/dice/economy/domain/balance.ts instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/dice/admin/application/**/*.ts",
      "src/dice/admin/domain/**/*.ts",
      "src/dice/analytics/application/**/*.ts",
      "src/dice/analytics/domain/**/*.ts",
      "src/dice/economy/application/**/*.ts",
      "src/dice/economy/domain/**/*.ts",
      "src/dice/inventory/application/**/*.ts",
      "src/dice/inventory/domain/**/*.ts",
      "src/dice/progression/application/**/*.ts",
      "src/dice/progression/domain/**/*.ts",
      "src/dice/pvp/application/**/*.ts",
      "src/dice/pvp/domain/**/*.ts",
      "src/dice/random-events/application/**/*.ts",
      "src/dice/random-events/domain/**/*.ts",
      "src/system/*/application/**/*.ts",
      "src/shared-kernel/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["discord.js"],
              message: "Discord imports belong in interfaces/discord or app/discord only.",
            },
            {
              group: ["**/app/discord/**", "**/bot/**"],
              message: "Context application and domain code must not depend on Discord runtime modules.",
            },
          ],
        },
      ],
    },
  },
];
