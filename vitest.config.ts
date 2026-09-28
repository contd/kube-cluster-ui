import { defineConfig } from 'vitest/config';

/** Vitest configuration for isolated renderer unit tests in jsdom. */
export default defineConfig({
  test: {
    /** Restrict the unit runner to explicit unit-test files. */
    environment: 'jsdom',
    include: ['tests/**/*.unit.test.ts'],
  },
});
