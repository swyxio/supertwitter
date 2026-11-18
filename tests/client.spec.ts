import { test, expect } from '@playwright/test'
import type { Post } from '../src/model'

const sampleListPost: Post = {
  id: '1234567890123456789',
  author: { id: '789', name: 'Example Research', username: 'example_ai' },
  createdAt: '2026-10-15T12:01:00Z',
  text: 'Sample public post about AI evaluations.',
  repostedBy: 'example_curator',
  quote: {
    author: { id: '790', name: 'Another Author', username: 'quoted_example' },
    text: 'A quoted result.',
  },
  media: [
    {
      type: 'video',
      url: '/media/golden-gate.webp',
      alt: 'Fixture video preview.',
    },
  ],
  metrics: { replies: 2, reposts: 3, likes: 4 },
}
const listSnapshot = {
  posts: [sampleListPost],
  updatedAt: '2026-10-15T12:10:00Z',
}

// Preview and UI tests never consume the deployed feed.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/high-signal', (route) =>
    route.fulfill({ json: listSnapshot })
  )
})

test('preview drafts, replies and posts survive reload under the right account', async ({
  page,
}) => {
  await page.goto('/')
  const compose = page.getByRole('textbox', { name: 'Post text', exact: true })
  await compose.fill('A draft for Alex.')
  await page
    .getByRole('button', { name: 'Switch account', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Studio Notes/ })
    .click()
  await expect(compose).toHaveValue('')
  await compose.fill('A post from Studio.')
  await page.locator('.composer .post-submit').click()
  let post = page
    .getByRole('article')
    .filter({ hasText: 'A post from Studio.' })
  await expect(post).toContainText('Studio Notes')
  await page.reload()
  await expect(post).toBeVisible()
  await post.getByRole('button', { name: 'Reply', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Reply text' })
    .fill('A reply from Studio.')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reply', exact: true })
    .click()
  await expect(
    page.getByRole('article').filter({ hasText: 'A reply from Studio.' })
  ).toBeVisible()
  await expect(
    post.getByRole('button', { name: 'Reply', exact: true })
  ).toHaveText('1')
  await page
    .getByRole('button', { name: 'Switch account', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Alex Morgan/ })
    .click()
  await expect(compose).toHaveValue('A draft for Alex.')
  await expect(
    page.getByText('A post from Studio.', { exact: true })
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Drafts', exact: true }).click()
  await expect(
    page.getByRole('button', { name: /Post draft A draft for Alex/ })
  ).toBeVisible()
})

test('bookmarks, search, feed options and the desktop shell work without outside requests', async ({
  page,
}) => {
  const external: string[] = []
  page.on('request', (r) => {
    if (
      new URL(r.url()).hostname !==
        new URL(page.url() || 'http://localhost').hostname &&
      page.url() !== 'about:blank'
    )
      external.push(r.url())
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'For you', exact: true }).click()
  const post = page.getByRole('article').first()
  await post.getByRole('button', { name: 'Like', exact: true }).click()
  await expect(
    post.getByRole('button', { name: 'Unlike', exact: true })
  ).toHaveText('387')
  await post.getByRole('button', { name: 'Bookmark', exact: true }).click()
  await page.getByRole('link', { name: 'Bookmarks', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page
    .getByRole('button', { name: 'Remove bookmark', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Save posts for later' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Timeline settings' }).click()
  await page.getByRole('button', { name: 'Default light' }).click()
  await page.getByRole('switch', { name: /Show media/ }).uncheck()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.keyboard.press('/')
  await page.getByRole('searchbox', { name: 'Search timeline' }).fill('bridge')
  await page.getByRole('searchbox', { name: 'Search timeline' }).press('Enter')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.locator('article .photo')).toHaveCount(0)
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' })
  ).toBeVisible()
  expect(external).toEqual([])
})

test('attachment and character limits work in preview', async ({ page }) => {
  await page.goto('/')
  const composer = page.locator('.composer')
  const edit = composer.getByRole('textbox', { name: 'Post text' })
  await edit.fill('界'.repeat(141))
  await expect(composer.locator('.remaining')).toHaveText('-2')
  await expect(composer.locator('.post-submit')).toBeDisabled()
  await edit.fill('')
  await composer
    .locator('input[type=file]')
    .setInputFiles('public/media/golden-gate.webp')
  await composer
    .getByRole('textbox', { name: 'Image description' })
    .fill('A locally attached bridge.')
  await page.reload()
  await expect(
    composer.getByRole('textbox', { name: 'Image description' })
  ).toHaveValue('A locally attached bridge.')
  await composer.locator('.post-submit').click()
  await expect(
    page
      .getByRole('article')
      .first()
      .getByRole('img', { name: 'A locally attached bridge.' })
  ).toBeVisible()
  await page.reload()
  await expect(
    page
      .getByRole('article')
      .first()
      .getByRole('img', { name: 'A locally attached bridge.' })
  ).toBeVisible()
})

test('mobile navigation, dialogs and direct routes fit at narrow widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/bookmarks')
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' })
  await expect(nav).toBeVisible()
  await nav.getByRole('button', { name: 'More options' }).click()
  await page.getByRole('button', { name: 'Switch or connect accounts' }).click()
  await expect(
    page
      .getByRole('dialog')
      .getByRole('link', { name: 'Download connector', exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await nav.getByRole('button', { name: 'Home', exact: true }).click()
  await page.getByRole('button', { name: 'For you', exact: true }).click()
  await page
    .getByRole('article')
    .first()
    .getByRole('button', { name: 'Expand photo' })
    .click()
  await expect(page.getByRole('dialog', { name: 'Photo' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/post/sample-bridge')
  await expect(page.getByRole('article')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375
  )
})

test('text posts can continue in the official X composer without a connector', async ({
  page,
}) => {
  await page.goto('/')
  const text = 'A draft with #tags & an emoji 🚀'
  await page.getByRole('textbox', { name: 'Post text', exact: true }).fill(text)
  const intent = page.getByRole('link', { name: 'Continue on X' })
  const url = new URL((await intent.getAttribute('href'))!)
  expect(url.origin + url.pathname).toBe('https://x.com/intent/tweet')
  expect(url.searchParams.get('text')).toBe(text)
  await expect(intent).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.locator('.composer textarea')).toHaveValue(text)
})

test('pinned accounts set keyboard order and switching identities preserves composer context', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Switch account', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Pin @studionotes', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Alt+1')
  await expect(page.locator('.identity-switch')).toContainText('Studio Notes')
  await page.keyboard.press('n')
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Post text' })
    .fill('A studio draft')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Switch posting account' })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Alex Morgan/ })
    .click()
  await expect(page.getByRole('dialog', { name: 'Compose post' })).toBeVisible()
  await expect(
    page.getByRole('dialog').getByRole('textbox', { name: 'Post text' })
  ).toHaveValue('')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Alt+1')
  await expect(page.locator('main textarea')).toHaveValue('A studio draft')
})

test('AI High Signal is the public home timeline, with original post links and read-only metrics', async ({
  page,
}) => {
  let requests = 0
  await page.route('**/api/high-signal', (route) => {
    requests++
    expect(route.request().method()).toBe('GET')
    expect(new URL(route.request().url()).origin).toBe(
      new URL(page.url()).origin
    )
    return route.fulfill({ json: listSnapshot })
  })
  await page.goto('/bookmarks')
  await expect(
    page.getByRole('heading', { name: 'Bookmarks', exact: true })
  ).toBeVisible()
  expect(requests).toBe(0)
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  const listTab = page.getByRole('button', {
    name: 'AI High Signal',
    exact: true,
  })
  await expect(listTab).toHaveAttribute('aria-pressed', 'true')
  const post = page
    .getByRole('article')
    .filter({ hasText: sampleListPost.text })
  await expect(post).toContainText('@example_ai')
  await expect(
    post.getByRole('link', { name: '@example_curator reposted' })
  ).toHaveAttribute('href', 'https://x.com/example_curator')
  await expect(post).toContainText('A quoted result.')
  await expect(post.getByRole('link', { name: 'Watch on X' })).toHaveAttribute(
    'href',
    'https://x.com/i/status/' + sampleListPost.id
  )
  await expect(post.locator('time')).toHaveAttribute(
    'datetime',
    sampleListPost.createdAt
  )
  await expect(post.getByRole('link', { name: 'View on X' })).toHaveAttribute(
    'href',
    'https://x.com/example_ai/status/' + sampleListPost.id
  )
  await expect(
    post.getByRole('button', { name: 'Like', exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByText('Took the long way home', { exact: false })
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'For you', exact: true }).click()
  await expect(
    page.getByText('Took the long way home', { exact: false })
  ).toBeVisible()
  await expect(post).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'For you', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  expect(requests).toBe(1)
})

test('list failure can be retried and an empty list does not show sample posts', async ({
  page,
}) => {
  let requests = 0
  await page.route('**/api/high-signal', (route) => {
    requests++
    if (requests === 1)
      return route.fulfill({
        status: 503,
        body: 'sensitive upstream diagnostic',
      })
    if (requests === 2)
      return route.fulfill({ json: { ...listSnapshot, posts: [] } })
    return route.fulfill({ json: listSnapshot })
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    'Couldn’t load the AI High Signal feed.'
  )
  await expect(page.getByText('sensitive upstream diagnostic')).toHaveCount(0)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(
    page.getByRole('heading', { name: 'No posts in this list yet' })
  ).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
  await page.getByRole('button', { name: 'Refresh AI High Signal' }).click()
  await expect(page.getByText(sampleListPost.text)).toBeVisible()
})

test('connected accounts keep Following as their default and the list keeps original author and repost credit', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const profile = {
      id: '4321',
      name: 'Connected Fixture',
      username: 'connected_fixture',
    }
    localStorage.setItem('superTwitter.account', JSON.stringify(profile))
    window.addEventListener('message', (event) => {
      const request = event.data
      if (request?.source !== 'supertwitter:page') return
      const result =
        request.method === 'accounts'
          ? [profile]
          : request.method === 'timeline'
            ? { posts: [] }
            : {}
      window.postMessage(
        { source: 'supertwitter:extension', id: request.id, ok: true, result },
        location.origin
      )
    })
  })
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Following', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('heading', { name: 'No posts yet' })
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'AI High Signal', exact: true })
    .click()
  const post = page
    .getByRole('article')
    .filter({ hasText: sampleListPost.text })
  await expect(
    post.getByRole('link', { name: '@example_curator reposted' })
  ).toHaveAttribute('href', 'https://x.com/example_curator')
  await expect(
    post.getByRole('button', { name: /Example Research @example_ai/ })
  ).toBeVisible()
  await expect(
    post.getByRole('button', { name: 'Like', exact: true })
  ).toBeVisible()
})
