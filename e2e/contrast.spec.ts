// The accessibility gate jsdom cannot be: a real browser computes the colours, so axe's `color-contrast`
// rule runs. Every state of the three components must have no WCAG 2.2 AA violation in every theme × season.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const THEMES = ['light', 'dark'] as const
const SEASONS = [null, 'spring', 'summer', 'autumn', 'winter'] as const

async function audit(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze()
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(0, 3).join(' | ')}`),
  }))
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([])
}

function open(page: Page, theme: string, season: string | null, view: string, fail = 'none') {
  const q = new URLSearchParams({ theme, view, fail })
  if (season) q.set('season', season)
  return page.goto(`/?${q}`)
}

async function pickFile(page: Page): Promise<void> {
  await page.setInputFiles('input[type="file"]', { name: 'icon.png', mimeType: 'image/png', buffer: Buffer.from([1, 2, 3]) })
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
}

for (const theme of THEMES) {
  for (const season of SEASONS) {
    const name = `${theme}${season ? ` · ${season}` : ''}`

    test(`relay badge states (${name})`, async ({ page }) => {
      await open(page, theme, season, 'badges')
      await expect(page.getByText('Relay unreachable')).toBeVisible()
      await expect(page.getByText('tip unknown')).toBeVisible()
      await expect(page.getByText('tip above the limit')).toBeVisible()
      await expect(page.getByText('Relay address is not valid')).toBeVisible()
      await expect(page.getByText('Checking relay…')).toBeVisible()
      await audit(page)
    })

    test(`purchase prompt states (${name})`, async ({ page }) => {
      await open(page, theme, season, 'cta')
      await expect(page.getByText('Operator receives').first()).toBeVisible()
      await expect(page.getByText('The pass price could not be read from the chain')).toBeVisible()
      await audit(page)
    })

    test(`upload widget: file, options and review steps (${name})`, async ({ page }) => {
      await open(page, theme, season, 'upload')
      await audit(page)
      await pickFile(page)
      await expect(page.getByLabel('Storage duration')).toBeVisible()
      await audit(page)
      await page.getByRole('button', { name: 'Next' }).click()
      await expect(page.getByText('Estimated cost')).toBeVisible()
      await audit(page)
    })

    for (const [fail, shows] of [
      ['retry', 'Retry upload'],
      ['certify', 'Certify blob'],
      ['duplicate', 'You already have this blob'],
      ['hang', 'Uploading to Walrus'],
    ] as const) {
      test(`upload widget: ${fail} state (${name})`, async ({ page }) => {
        await open(page, theme, season, 'upload', fail)
        await pickFile(page)
        await page.getByRole('button', { name: 'Next' }).click()
        await page.getByRole('button', { name: 'Upload to Walrus' }).click()
        if (fail === 'retry') await page.getByRole('button', { name: 'Change options' }).click()
        await expect(page.getByText(shows).first()).toBeVisible()
        await audit(page)
      })
    }
  }
}
