import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "android/**",
      ".pages/**",
      ".tmp/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "tests/fixtures/**",
      "tests/reports/**"
    ]
  },
  {
    files: [
      "src/**/*.js",
      "public/**/*.js",
      "supabase/functions/**/*.js",
      "scripts/**/*.js",
      "scripts/**/*.mjs",
      "tests/**/*.js"
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-dupe-keys": "error",
      "no-func-assign": "error",
      "no-unreachable": "error"
    }
  }
];
