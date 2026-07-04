import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // When running under Vitest, resolve Svelte with browser conditions so that
  // @testing-library/svelte can mount components (mount() is not available on the server bundle).
  resolve: process.env.VITEST ? { conditions: ['browser'] } : {},
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    environmentMatchGlobs: [['src/lib/components/**/*.test.ts', 'happy-dom']],
    coverage: {
      provider: 'v8',
      // .svelte components need browser/E2E tests, not Vitest unit tests.
      // .d.ts files are type declarations with no runtime coverage.
      include: ['src/**/*.{js,ts}'],
      exclude: ['src/app.d.ts', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
      thresholds: { lines: 95 },
    },
  },
});
