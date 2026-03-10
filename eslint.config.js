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
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/shared/economy"],
              message:
                "The legacy shared/economy compatibility path was removed. Import from the owning context instead.",
            },
            {
              group: ["**/dice/core/**", "**/dice/features/**"],
              message:
                "Legacy compatibility paths were removed. Import from the owning context path instead.",
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
  {
    files: [
      "src/dice/analytics/application/**/*.ts",
      "src/dice/economy/application/**/*.ts",
      "src/dice/inventory/application/**/*.ts",
      "src/dice/progression/application/**/*.ts",
      "src/dice/pvp/application/**/*.ts",
      "src/dice/random-events/application/**/*.ts",
      "src/system/*/application/**/*.ts",
    ],
    ignores: ["src/dice/admin/application/**/*.ts"],
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
            {
              group: ["**/shared/db"],
              message:
                "Application code should depend on ports and unit-of-work abstractions, not shared/db directly.",
            },
          ],
        },
      ],
    },
  },
];
