// eslint.config.js
import globals from "globals";
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // 首先引入推荐配置
  pluginJs.configs.recommended,

  // 然后覆盖或自定义特定规则
  {
    languageOptions: {
      globals: globals.browser,
      ecmaVersion: 2021,
      sourceType: "module",
    },
    rules: {
      "no-undef": "error",              // 禁止使用未声明的变量或函数。
      "semi": ["error", "always"],      // 强制在语句末尾使用分号。
      "curly": "warn",                  // 强制使用花括号包裹代码块。
      "no-unused-vars": "off",          // 禁用未使用变量的警告。
      "no-unreachable": "off",          // 禁用无法到达代码的警告。
    },
  },
];
