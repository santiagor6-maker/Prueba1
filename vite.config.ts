import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    // One self-contained file: scripts/inline.ts folds the bundle into index.html so it opens from disk.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    rolldownOptions: { output: { codeSplitting: false } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
