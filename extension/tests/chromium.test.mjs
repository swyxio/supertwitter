import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const extension = fileURLToPath(new URL('../', import.meta.url))
const extensionId = 'jelofgahokkopafgdidnhakohanfcmjm'
const samplePng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl9HxkAAAAASUVORK5CYII='
function bridge(page, method, params = {}) {
  return page.evaluate(
    ({ method, params }) =>
      new Promise((resolve) => {
        const id = crypto.randomUUID()
        const timeout = setTimeout(() => {
          window.removeEventListener('message', receive)
          resolve({ timeout: true })
        }, 5000)
        function receive(e) {
          if (
            e.source !== window ||
            e.origin !== location.origin ||
            e.data?.source !== 'supertwitter:extension' ||
            e.data.id !== id
          )
            return
          window.removeEventListener('message', receive)
          clearTimeout(timeout)
          resolve(e.data)
        }
        window.addEventListener('message', receive)
        window.postMessage(
          { source: 'supertwitter:page', id, method, params },
          location.origin
        )
      }),
    { method, params }
  )
}

test(
  'unpacked MV3 extension scopes accounts to allowed pages and only writes after its own confirmation',
  { timeout: 45000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'supertwitter-extension-'))
    const context = await chromium.launchPersistentContext(directory, {
      channel: 'chromium',
      headless: true,
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
      await rm(directory, { force: true, recursive: true })
    })
    // Use fixture documents for all origins. The test never contacts X.
    await context.route('**/*', (route) =>
      new URL(route.request().url()).protocol === 'chrome-extension:'
        ? route.continue()
        : route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><title>Connector test</title>',
          })
    )
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'))
    assert.equal(new URL(worker.url()).host, extensionId)
    await worker.evaluate(async () => {
      const record = (n) => ({
        accessToken: 'fixture-private-' + n,
        refreshToken: 'fixture-private-refresh',
        clientId: 'fixture-app',
        profile: { id: String(n), username: 'user' + n, name: 'User ' + n },
        expiresAt: Date.now() + 60000 * 10,
      })
      await chrome.storage.local.set({
        'account:11': record(11),
        'account:22': record(22),
      })
      self.apiCalls = []
      self.fetch = async (url, options) => {
        const path = new URL(url).pathname
        if (new URL(url).origin !== 'https://api.x.com')
          throw new Error('Unexpected destination')
        self.apiCalls.push({
          path,
          method: options.method,
          token: options.headers.Authorization,
          body: options.body,
        })
        const post = {
          id: '33',
          text: 'From the mocked X API',
          created_at: '2024-01-01T12:00:00Z',
          author_id: '22',
        }
        if (path === '/2/tweets') return Response.json({ data: { id: '44' } })
        if (path === '/2/media/upload' || path === '/2/media/metadata')
          return Response.json({ data: { id: '55' } })
        return Response.json({
          data: path === '/2/tweets/33' ? post : [post],
          includes: {
            users: [{ id: '22', username: 'user22', name: 'User 22' }],
          },
        })
      }
    })

    const page = await context.newPage()
    await page.goto('https://x.swyx.io/')
    assert.equal((await bridge(page, 'ping')).result.version, '1.0.0')
    const accounts = await bridge(page, 'accounts')
    assert.deepEqual(
      accounts.result.map((p) => p.username),
      ['user11', 'user22']
    )
    assert.ok(!JSON.stringify(accounts).includes('fixture-private'))
    for (const method of ['timeline', 'bookmarks', 'profile', 'mentions']) {
      const response = await bridge(page, method, { accountId: '22' })
      assert.equal(response.result.posts[0].author.username, 'user22')
    }
    assert.equal(
      (await bridge(page, 'lookup', { accountId: '11', postId: '33' })).result
        .id,
      '33'
    )

    const optsOpened = context.waitForEvent('page')
    assert.equal((await bridge(page, 'manage')).ok, true)
    const options = await optsOpened
    await options.locator('#client-id').waitFor()
    assert.equal(
      await options.locator('#callback').inputValue(),
      'https://' + extensionId + '.chromiumapp.org/x'
    )
    assert.match(await options.locator('#accounts').textContent(), /@user22/)
    // Simulate the provider approval and token endpoints. The interactive Chrome
    // tab never sends a real authorization code or contacts a real account.
    await worker.evaluate(() => {
      const fixtureApi = self.fetch
      chrome.identity.launchWebAuthFlow = async ({ url }) => {
        const query = new URL(url).searchParams
        if (
          query.get('client_id') !== 'test-public-app' ||
          query.get('code_challenge_method') !== 'S256'
        )
          throw Error('Invalid login')
        return (
          query.get('redirect_uri') +
          '?code=fixture-code&state=' +
          query.get('state')
        )
      }
      self.fetch = async (url, opts) => {
        const path = new URL(url).pathname
        if (path === '/2/oauth2/token') {
          const refresh = opts.body.get('grant_type') === 'refresh_token'
          if (
            !refresh &&
            (opts.body.get('code') !== 'fixture-code' ||
              !opts.body.get('code_verifier'))
          )
            throw Error('Incomplete PKCE')
          return Response.json({
            token_type: 'bearer',
            access_token: refresh ? 'rotated' : 'initial',
            refresh_token: 'fixture-refresh-33',
            expires_in: refresh ? 7200 : 1,
          })
        }
        if (path === '/2/users/me')
          return Response.json({
            data: { id: '33', name: 'User 33', username: 'user33' },
          })
        return fixtureApi(url, opts)
      }
    })
    await options.locator('#client-id').fill('test-public-app')
    await options.getByRole('button', { name: 'Connect with X' }).click()
    await options.getByText('Connected @user33.', { exact: false }).waitFor()
    assert.equal((await bridge(page, 'accounts')).result.length, 3)
    await bridge(page, 'profile', { accountId: '33' })
    assert.match(
      await worker.evaluate(() => self.apiCalls.at(-1).token),
      /rotated$/
    )
    options.once('dialog', (dialog) => dialog.accept())
    await options
      .getByRole('button', { name: 'Remove @user33 from this browser' })
      .click()
    await options.getByText('Removed @user33 from this browser.').waitFor()
    const localhost = await context.newPage()
    await localhost.goto('http://127.0.0.1:5173/')
    assert.match((await bridge(localhost, 'accounts')).error, /Allow this site/)
    await options.locator('#local').check()
    await options.getByText('Site access saved.').waitFor()
    assert.equal((await bridge(localhost, 'accounts')).result.length, 2)

    const opened = context.waitForEvent('page')
    const publishing = bridge(page, 'post', {
      accountId: '22',
      text: 'Mock reply',
      replyTo: '33',
      image: { dataUrl: samplePng, alt: 'Fixture image' },
    })
    const review = await opened
    await review.locator('#review').waitFor()
    assert.equal(
      await review.locator('#account').textContent(),
      'User 22 · @user22'
    )
    assert.equal(await review.locator('#text').textContent(), 'Mock reply')
    assert.equal(
      await review.locator('#image').getAttribute('alt'),
      'Fixture image'
    )
    assert.equal(
      await worker.evaluate(
        () => self.apiCalls.filter((c) => c.method === 'POST').length
      ),
      0
    )
    await review.getByRole('button', { name: 'Post reply' }).click()
    assert.deepEqual((await publishing).result, { id: '44' })
    const writes = await worker.evaluate(() =>
      self.apiCalls.filter((c) => c.method === 'POST')
    )
    assert.deepEqual(
      writes.map((c) => c.path),
      ['/2/media/upload', '/2/media/metadata', '/2/tweets']
    )
    assert.ok(writes.every((c) => c.token === 'Bearer fixture-private-22'))

    const cancelOpened = context.waitForEvent('page')
    const canceled = bridge(page, 'like', {
      accountId: '11',
      postId: '33',
      active: true,
    })
    const confirmation = await cancelOpened
    await confirmation.getByRole('button', { name: 'Cancel' }).click()
    assert.match((await canceled).error, /canceled/)
    assert.equal(
      await worker.evaluate(
        () => self.apiCalls.filter((c) => c.method === 'POST').length
      ),
      3
    )

    const unknown = await context.newPage()
    await unknown.goto('https://unrelated.invalid/')
    assert.equal((await bridge(unknown, 'ping')).timeout, true)
  }
)
