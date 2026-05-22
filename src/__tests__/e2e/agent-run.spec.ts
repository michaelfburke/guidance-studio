/**
 * E2E smoke tests for GuidanceStudio using Playwright + Electron.
 * Run with: npm run test:e2e
 *
 * Requires the app to be built first: npm run build
 */
import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ENTRY = path.resolve(__dirname, '../../../../out/main/main.js')

test.describe('GuidanceStudio app', () => {
  test('launches and shows the home page', async () => {
    const app = await electron.launch({ args: [APP_ENTRY] })
    const win = await app.firstWindow()

    await win.waitForLoadState('domcontentloaded')
    await expect(win.locator('text=GuidanceStudio')).toBeVisible({ timeout: 10_000 })

    await app.close()
  })

  test('navigates to New Run page from sidebar', async () => {
    const app = await electron.launch({ args: [APP_ENTRY] })
    const win = await app.firstWindow()

    await win.waitForLoadState('domcontentloaded')
    await win.click('text=New Run')
    await expect(win.locator('text=Document a Feature')).toBeVisible({ timeout: 5_000 })

    await app.close()
  })

  test('shows validation error for empty form submission', async () => {
    const app = await electron.launch({ args: [APP_ENTRY] })
    const win = await app.firstWindow()

    await win.waitForLoadState('domcontentloaded')
    await win.click('text=New Run')

    // Try to submit without filling required fields
    const startButton = win.locator('button', { hasText: /Start/i })
    if (await startButton.isVisible()) {
      await startButton.click()
      // Should not navigate away — form validation keeps us on the page
      await expect(win.locator('text=Document a Feature')).toBeVisible()
    }

    await app.close()
  })

  test('navigates to Settings page', async () => {
    const app = await electron.launch({ args: [APP_ENTRY] })
    const win = await app.firstWindow()

    await win.waitForLoadState('domcontentloaded')
    await win.click('text=Settings')
    await expect(win.locator('text=LLM Providers')).toBeVisible({ timeout: 5_000 })

    await app.close()
  })
})
