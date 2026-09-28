import { defineConfig, devices } from '@playwright/test';

/** Browser-test configuration, including CI reporters and the local Vite server. */
export default defineConfig({
  /** Directory containing browser end-to-end tests. */
  testDir: './tests',
  /** Keep Vitest unit-test files out of the browser runner. */
  testIgnore: ['**/*.unit.test.ts'],
  /** Run independent browser tests concurrently. */
  fullyParallel: true,
  /** Prevent focused tests from entering continuous integration. */
  forbidOnly: Boolean(process.env.CI),
  /** Retry failed browser tests in continuous integration. */
  retries: process.env.CI ? 2 : 0,
  /** Emit GitHub annotations and HTML/JSON reports in CI; use concise output locally. */
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { outputFolder: 'reports/e2e', open: 'never' }],
        ['json', { outputFile: 'reports/e2e/results.json' }],
      ]
    : 'list',
  use: {
    /** Local Vite origin shared by the browser-test project. */
    baseURL: 'http://127.0.0.1:4173',
    /** Capture a diagnostic trace for the first retry. */
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    /** Start the renderer's Vite development server for browser tests. */
    command: 'npx vite --host 127.0.0.1 --port 4173',
    /** Wait until the renderer is available before opening test pages. */
    url: 'http://127.0.0.1:4173',
    /** Reuse a developer server locally but always create an isolated CI server. */
    reuseExistingServer: !process.env.CI,
  },
});
