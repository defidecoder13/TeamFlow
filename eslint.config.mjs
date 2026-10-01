import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/build/**',
      '**/next-env.d.ts',
      'apps/web/components/mock-ui/**',
      'apps/web/components/mock-views/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
