import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'

const app = 'http://127.0.0.1:5173'
const extension = fileURLToPath(new URL('../', import.meta.url))
const photo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl9HxkAAAAASUVORK5CYII=',
  'base64'
)

test(
  'site and unpacked local connector switch, post, bookmark and reload against a fixture X API',
  { timeout: 90000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'supertwitter-site-'))
    const context = await chromium.launchPersistentContext(directory, {
      viewport: { width: 1440, height: 1024 },
      headless: true,
      channel: 'chromium',
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
      args: [
        '--disable-extensions-except=' + extension,
        '--load-extension=' + extension,
      ],
    })
    t.after(async () => {
      await context.close()
      await rm(directory, { recursive: true, force: true })
    })
    await context.route('**/*', (route) => {
      const target = new URL(route.request().url())
      if (target.origin === app || target.protocol === 'chrome-extension:')
        return route.continue()
      if (target.hostname === 'pbs.twimg.com')
        return route.fulfill({ contentType: 'image/png', body: photo })
      return route.abort()
    })
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'))
    await worker.evaluate(async () => {
      const profiles = [
        { id: '11', name: 'Alice Demo', username: 'alicefixture' },
        { id: '22', name: 'Bob Demo', username: 'bobfixture' },
      ]
      const store = { localAccess: true }
      for (const person of profiles) {
        store['account:' + person.id] = {
          profile: person,
          clientId: 'test-client',
          accessToken: 'fixture-' + person.id,
          refreshToken: 'test-refresh-' + person.id,
          expiresAt: Date.now() + 3600000,
        }
      }
      await chrome.storage.local.set(store)
      const post = (id, text, author_id) => ({
        id,
        text,
        author_id,
        created_at: '2026-09-11T15:10:00Z',
        public_metrics: {},
      })
      const records = new Map([
        ['111', post('111', 'Alice timeline fixture', '11')],
        ['222', post('222', 'Bob timeline fixture', '22')],
        ['909', post('909', 'Independent lookup fixture', '11')],
      ])
      const timeline = { 11: ['111'], 22: ['222'] }
      const marks = { 11: new Set(), 22: new Set() }
      const media = []
      self.fixtureCalls = []
      self.fetch = async (url, init = {}) => {
        if (new URL(url).origin !== 'https://api.x.com')
          throw Error('Unexpected fixture destination')
        const path = new URL(url).pathname
        const accountId = String(init.headers.Authorization).replace(
          'Bearer fixture-',
          ''
        )
        if (!timeline[accountId]) throw Error('Unexpected fixture account')
        const method = init.method ?? 'GET'
        const body = init.body ? JSON.parse(init.body) : undefined
        self.fixtureCalls.push({ path, method, accountId })
        const includes = { users: profiles, media }
        if (method === 'GET') {
          if (path.startsWith('/2/tweets/'))
            return Response.json({
              data: records.get(path.split('/')[3]),
              includes,
            })
          let ids
          if (
            path ===
              '/2/users/' + accountId + '/timelines/reverse_chronological' ||
            path === '/2/users/' + accountId + '/tweets'
          )
            ids = timeline[accountId]
          if (path === '/2/users/' + accountId + '/bookmarks')
            ids = [...marks[accountId]]
          if (path === '/2/users/' + accountId + '/mentions') ids = ['909']
          if (ids)
            return Response.json({
              data: ids.map((id) => records.get(id)),
              includes,
            })
        } else if (path === '/2/media/upload') {
          media.push({
            media_key: '3_555',
            type: 'photo',
            url: 'https://pbs.twimg.com/media/fixture.png',
          })
          return Response.json({ data: { id: '555' } })
        } else if (path === '/2/media/metadata') {
          media.at(-1).alt_text = body.metadata.alt_text.text
          return Response.json({ data: { id: '555' } })
        } else if (path === '/2/tweets' && method === 'POST') {
          const id = String(880 + records.size)
          const result = post(id, body.text ?? '', accountId)
          if (body.media) result.attachments = { media_keys: ['3_555'] }
          records.set(id, result)
          timeline[accountId].unshift(id)
          return Response.json({ data: { id } })
        } else if (path.startsWith('/2/users/' + accountId + '/bookmarks')) {
          const active = method === 'POST'
          if (active) marks[accountId].add(body.tweet_id)
          else marks[accountId].delete(path.split('/').at(-1))
          return Response.json({ data: { bookmarked: active } })
        }
        throw Error('Unhandled fixture request ' + method + ' ' + path)
      }
    })

    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(app)
    const timelinePost = (name) =>
      page.locator('article.post-card').filter({ hasText: name })
    const composer = page.locator('main .composer')
    const draft = composer.getByRole('textbox', { name: 'Post text' })
    const submit = composer.getByRole('button', { name: 'Post', exact: true })
    const switchTo = async (handle) => {
      await composer
        .getByRole('button', { name: 'Choose posting account' })
        .click()
      await page
        .getByRole('dialog', { name: 'Switch accounts' })
        .locator('button.account-row').filter({ hasText: '@' + handle })
        .click()
    }
    async function review(trigger) {
      const waiter = context.waitForEvent('page')
      await trigger.click()
      const view = await waiter
      await expect(view.locator('#review')).toBeVisible()
      return view
    }
    await expect(timelinePost('Alice timeline fixture')).toBeVisible()
    await draft.fill('Alice draft kept separate')
    await switchTo('bobfixture')
    await expect(timelinePost('Bob timeline fixture')).toBeVisible()
    await expect(timelinePost('Alice timeline fixture')).toHaveCount(0)
    await expect(draft).toHaveValue('')
    await draft.fill('Bob’s image post')
    await composer
      .locator('[type="file"]')
      .setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: photo,
      })
    await composer
      .getByRole('textbox', { name: 'Image description' })
      .fill('One fixture pixel')

    const canceled = await review(submit)
    await expect(canceled.locator('#account')).toHaveText(
      'Bob Demo · @bobfixture'
    )
    await expect(canceled.locator('#text')).toHaveText('Bob’s image post')
    await expect(canceled.locator('#image')).toHaveAttribute(
      'alt',
      'One fixture pixel'
    )
    await canceled.getByRole('button', { name: 'Cancel' }).click()
    await expect(composer.getByRole('alert')).toContainText('canceled')
    await expect(draft).toHaveValue('Bob’s image post')
    assert.equal(
      await worker.evaluate(
        () => self.fixtureCalls.filter((c) => c.method !== 'GET').length
      ),
      0
    )

    const approved = await review(submit)
    await approved.getByRole('button', { name: 'Publish post' }).click()
    await expect(draft).toHaveValue('')
    const created = timelinePost('Bob’s image post')
    await expect(created).toBeVisible()
    await expect(
      created.getByRole('img', { name: 'One fixture pixel' })
    ).toBeVisible()
    assert.deepEqual(
      await worker.evaluate(() =>
        self.fixtureCalls.filter((c) => c.method !== 'GET')
      ),
      [
        { path: '/2/media/upload', method: 'POST', accountId: '22' },
        { path: '/2/media/metadata', method: 'POST', accountId: '22' },
        { path: '/2/tweets', method: 'POST', accountId: '22' },
      ]
    )

    const bookmark = await review(
      timelinePost('Bob timeline fixture').getByRole('button', {
        name: 'Bookmark',
        exact: true,
      })
    )
    await bookmark.getByRole('button', { name: 'Bookmark post' }).click()
    await expect(
      timelinePost('Bob timeline fixture').getByRole('button', {
        name: 'Remove bookmark',
      })
    ).toBeVisible()
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Bookmarks' })
      .click()
    await expect(timelinePost('Bob timeline fixture')).toBeVisible()
    await page.reload()
    await expect(timelinePost('Bob timeline fixture')).toBeVisible()
    await expect(timelinePost('Bob’s image post')).toHaveCount(0)

    await page.goto(app + '/post/909')
    await expect(timelinePost('Independent lookup fixture')).toBeVisible()
    assert.ok(
      await worker.evaluate(() =>
        self.fixtureCalls.some(
          (c) => c.path === '/2/tweets/909' && c.accountId === '22'
        )
      )
    )
    await page.getByRole('button', { name: 'Back to home' }).click()
    await expect(
      created.getByRole('img', { name: 'One fixture pixel' })
    ).toBeVisible()
    await switchTo('alicefixture')
    await expect(draft).toHaveValue('Alice draft kept separate')
    await expect(timelinePost('Bob’s image post')).toHaveCount(0)
    const alicePost = await review(submit)
    await expect(alicePost.locator('#account')).toHaveText(
      'Alice Demo · @alicefixture'
    )
    await alicePost.getByRole('button', { name: 'Publish post' }).click()
    await expect(timelinePost('Alice draft kept separate')).toBeVisible()
    const published = await worker.evaluate(() =>
      self.fixtureCalls
        .filter((c) => c.path === '/2/tweets' && c.method === 'POST')
        .map((c) => c.accountId)
    )
    assert.deepEqual(published, ['22', '11'])
    assert.deepEqual(pageErrors, [])
  }
)
