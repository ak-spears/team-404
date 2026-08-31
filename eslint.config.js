// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/drizzle/**',
      '**/.next/**',
      // Next.js-generated, not hand-written (see .gitignore) -- its triple-slash reference to
      // .next/types is what Next itself emits and isn't meant to satisfy our own lint rules.
      '**/next-env.d.ts',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
