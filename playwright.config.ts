import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 20_000,
  expect: { timeout: 3_000 },
  // The app runs from file://, whose storage is shared between contexts: run tests one at a time.
  workers: 1,
  use: { baseURL: `file://${process.cwd()}/dist/index.html`, locale: 'es-CO', timezoneId: 'America/Bogota' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});
