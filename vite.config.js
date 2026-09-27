import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths let the same build run on GitHub Pages (/mow-town/) and itch.io.
  base: './',
  build: {
    target: 'es2022',
    // Ships the licenses of bundled dependencies (e.g. Babylon.js, Apache-2.0) with the game.
    license: { fileName: 'THIRD-PARTY-LICENSES.md' },
    // Babylon.js is imported from its package root for simplicity (see docs/DECISIONS.md),
    // which makes one large (~6.7 MB, ~1.5 MB gzipped) chunk. That's expected for now.
    chunkSizeWarningLimit: 8000,
  },
  test: {
    include: ['src/**/*.test.js'],
  },
});
