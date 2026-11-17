import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:5173',
    channel: process.env.PW_CHANNEL || 'chromium',
    viewport: { width: 1360, height: 900 },
  },
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
      },
})
