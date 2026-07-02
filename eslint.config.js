import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const typescriptFiles = ["src/**/*.ts", "tests/**/*.ts"];

export default tseslint.config(
  {
    ignores: ["coverage/**", "dist/**", "node_modules/**"],
  },
  {
    ...eslint.configs.recommended,
    files: ["**/*.{js,mjs,cjs}"],
  },
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles,
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles,
  })),
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
