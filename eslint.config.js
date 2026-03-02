// eslint.config.js
import pluginJs from "@eslint/js";
import noFloatingPromise from "eslint-plugin-no-floating-promise";
import globals from "globals";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // First, import the recommended configuration
  pluginJs.configs.recommended,

  // Then override or customize specific rules
  {
    plugins: {
      "no-floating-promise": noFloatingPromise,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
        // True runtime globals injected into all bot/agent code
        skills: "readonly",
        log: "readonly",
        world: "readonly",
        bot: "readonly",
        agent: "readonly",
        Vec3: "readonly",
        // Globals used in real source files (not action-code only)
        Compartment: "readonly",   // SES Compartment, provided by ses lockdown (lockdown.js)
        res: "writable",           // NPC item_goal.js
        sendRequest: "readonly",   // novita.js and other model files
        chat_model_profile: "readonly", // prompter.js
      },
    },
    rules: {
      "no-undef": "error",              // Disallow the use of undeclared variables or functions.
      "semi": "off",                     // Allow flexible semicolon usage
      "curly": "off",                   // Do not enforce the use of curly braces around blocks of code.
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }], // Warn on unused vars (prefix with _ to ignore)
      "no-unreachable": "warn",          // Warn on unreachable code
      "require-await": "off",           // Allow async functions without await (disabled for compatibility)
      "no-floating-promise/no-floating-promise": "warn", // Warn on unhandled promises
      "no-control-regex": "off",         // Allow control characters in regex (needed for message validator)
      "no-ex-assign": "warn",            // Warn on assignment to exception parameters
      "no-fallthrough": "warn",          // Warn on case fallthrough (add /* falls through */ comment for intentional)
      "no-useless-escape": "warn",       // Warn on unnecessary escape characters
      "no-empty": ["warn", { "allowEmptyCatch": true }], // Warn on empty blocks, but allow empty catch
      "no-prototype-builtins": "warn",   // Warn on direct prototype method calls (use Object.hasOwn instead)
      "no-extra-boolean-cast": "off",    // Allow redundant boolean casts
    },
  },
  // Override rules for bot action files
  {
    files: ["bots/**/*.js"],
    rules: {
      "require-await": "off",           // Allow async functions without await in bot action files
    },
  },
  // Globals and rules for LLM-generated action-code files.
  // These identifiers are injected by the Coder sandbox at runtime and are not
  // true module-level globals — scoping them here prevents masking real
  // no-undef errors in the rest of the codebase.
  {
    files: ["**/action-code/*.js", "bots/execTemplate.js", "bots/lintTemplate.js"],
    languageOptions: {
      globals: {
        newAction: "readonly",
        nearbyEntities: "readonly",
        assert: "readonly",
        chat_model_profile: "readonly",
        result: "readonly",
        Compartment: "readonly",
        res: "writable",
        id: "readonly",
        cleanEmb: "readonly",
        text: "readonly",
        meta: "readonly",
        sendRequest: "readonly",
      },
    },
    rules: {
      "require-await": "off",
    },
  },
  // Allow non-top-level imports/exports in action-code files
  {
    files: ["**/action-code/*.js"],
    rules: {
      "no-restricted-syntax": "off",     // Allow imports/exports anywhere in action code files
    },
  },
  // Override for specific problematic files
  {
    files: ["**/action-code/7.js"],
    rules: {
      "no-restricted-syntax": ["error", {
        "selector": "ImportDeclaration, ExportDeclaration",
        "message": "Imports and exports must be at the top level"
      }],
    },
  },
];
