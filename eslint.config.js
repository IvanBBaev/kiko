import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'data/'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // JSON columns and external feed data are unavoidably `any` at the boundary;
      // we cast explicitly at parse sites instead.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Port contracts (NewsSource, PostGenerator, …) return Promises; sync
      // implementations and fastify handlers legitimately have no await.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // node:test's describe/it return promises by design; res.json() is `any`.
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    // eslint.config.js itself is not part of the TS project
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettierConfig,
);
