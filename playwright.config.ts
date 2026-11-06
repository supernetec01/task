import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: 'tests/browser',
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:3003',
    headless: true,
    launchOptions: {
      executablePath:
        process.env.BROWSER_EXECUTABLE ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: { baseURL: 'http://127.0.0.1:3004', viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [3003, 3004].map((port) => ({
    command: 'npm start',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    env: { HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test' },
  })),
});
