import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // webOS 3.x-5.x TVs ship Chromium 53-68. ES2017 keeps the shell
    // parseable on the oldest supported engines (optional chaining,
    // nullish coalescing, etc. get transpiled away).
    target: 'es2017',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
})
