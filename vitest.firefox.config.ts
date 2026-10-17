import { defineConfig } from 'vitest/config';

// The Firefox build in a real Firefox (tests/firefox), one test at a time.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/firefox/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
