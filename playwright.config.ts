import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3002',
    ...devices['Desktop Chrome'],
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3002',
    url: 'http://127.0.0.1:3002',
    reuseExistingServer: !process.env.CI,
    env: { DEMO_MODE: 'true', DEMO_PORT: '3002', DEMO_DATA_DIR: 'e2e', NEXT_DIST_DIR: '.next-e2e' },
    timeout: 120000,
  },
});
