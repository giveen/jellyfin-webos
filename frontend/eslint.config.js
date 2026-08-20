import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The shell intentionally logs liberally for on-TV debugging
      'no-console': 'off',
      // Bridge payloads are dynamic JSON from jellyfin-web
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    // Ambient declarations legitimately use `var` for global namespaces
    files: ['**/*.d.ts'],
    rules: {
      'no-var': 'off',
    },
  }
);
