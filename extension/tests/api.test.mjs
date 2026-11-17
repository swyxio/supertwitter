import test from 'node:test'
import assert from 'node:assert/strict'
import {
  callbackCode,
  exchange,
  feed,
  lookup,
  oauthRequest,
  whoami,
  write,
  writeParams,
} from '../api.mjs'

const redirect = 'https://jelofgahokkopafgdidnhakohanfcmjm.chromiumapp.org/x'
const sample = {
  id: '998',
  text: 'Sample',
  author_id: '17',
  created_at: '2025-10-01T12:00:00Z',
  public_metrics: {
    reply_count: 2,
    repost_count: 3,
    like_count: 4,
    impression_count: 17,
  },
  attachments: { media_keys: ['photo-1'] },
}
const includes = {
  users: [{ id: '17', name: 'Example', username: 'example', verified: true }],
  media: [
    {
      media_key: 'photo-1',
      type: 'photo',
      url: 'https://pbs.twimg.com/media/example.jpg',
      alt_text: 'A sample',
    },
  ],
}
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl9HxkAAAAASUVORK5CYII='

function mockApi(t, fn) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const location = new URL(url)
    assert.equal(location.origin, 'https://api.x.com')
    assert.equal(options.credentials, 'omit')
    assert.equal(options.redirect, 'error')
    calls.push({ location, options })
    return Response.json(await fn(location, options))
  })
  return calls
}

test('PKCE binds each authorization to its S256 verifier, state and exact callback', async () => {
  const auth = await oauthRequest('public-id', redirect)
  const p = new URL(auth.url).searchParams
  assert.equal(new URL(auth.url).origin, 'https://x.com')
  assert.equal(p.get('code_challenge_method'), 'S256')
  assert.equal(
    p.get('code_challenge'),
    Buffer.from(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(auth.verifier)
      )
    ).toString('base64url')
  )
  assert.equal(p.get('redirect_uri'), redirect)
  const query = '?code=example&state=' + auth.state
  assert.equal(callbackCode(redirect + query, redirect, auth.state), 'example')
  for (const value of [
    redirect + '/other' + query,
    'https://other.test/x' + query,
    redirect + '?code=example&state=other',
  ]) {
    assert.throws(() => callbackCode(value, redirect, auth.state))
  }
  assert.notEqual(auth.state, (await oauthRequest('public-id', redirect)).state)
})

test('public token exchange and profile expose only sanitized fields', async (t) => {
  const calls = mockApi(t, (url, opts) =>
    url.pathname === '/2/oauth2/token'
      ? {
          access_token: 'test-access',
          refresh_token: 'test-refresh',
          expires_in: 7200,
          token_type: 'bearer',
        }
      : {
          data: {
            ...includes.users[0],
            profile_image_url: 'https://other.test/tracker',
            token: 'example',
          },
        }
  )
  const token = await exchange({
    grant_type: 'authorization_code',
    client_id: 'public',
  })
  assert.deepEqual(await whoami(token.accessToken), {
    id: '17',
    username: 'example',
    name: 'Example',
    avatar: undefined,
    verified: true,
  })
  assert.equal(calls[0].options.body.get('client_id'), 'public')
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-access')
})

test('all four feeds and lookup use scoped endpoints, expansions and real pagination', async (t) => {
  const calls = mockApi(t, (url, opts) => ({
    data: url.pathname === '/2/tweets/998' ? sample : [sample],
    includes,
    meta: { next_token: 'next' },
  }))
  for (const [method, path] of Object.entries({
    timeline: 'timelines/reverse_chronological',
    bookmarks: 'bookmarks',
    mentions: 'mentions',
    profile: 'tweets',
  })) {
    const output = await feed('fixture', '17', method, 'abc+123')
    assert.equal(calls.at(-1).location.pathname, '/2/users/17/' + path)
    assert.equal(
      calls.at(-1).location.searchParams.get('pagination_token'),
      'abc+123'
    )
    assert.equal(output.posts[0].author.username, 'example')
    assert.equal(output.posts[0].metrics.reposts, 3)
    assert.equal(output.posts[0].media[0].alt, 'A sample')
    assert.equal(
      output.posts[0].bookmarked,
      method === 'bookmarks' ? true : undefined
    )
    assert.equal(output.nextToken, 'next')
  }
  assert.equal((await lookup('fixture', '998')).id, '998')
  await assert.rejects(lookup('fixture', '../me'))
})

test('reply with a photo uploads media and alt text before sending one post', async (t) => {
  const calls = mockApi(t, (url) => ({
    data: { id: url.pathname.startsWith('/2/media') ? '52' : '53' },
  }))
  const params = writeParams('post', {
    accountId: '17',
    text: 'Reply',
    replyTo: '22',
    image: { dataUrl: png, alt: 'A dot' },
  })
  assert.deepEqual(await write('fixture', 'post', params), { id: '53' })
  assert.deepEqual(
    calls.map((c) => c.location.pathname),
    ['/2/media/upload', '/2/media/metadata', '/2/tweets']
  )
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    id: '52',
    metadata: { alt_text: { text: 'A dot' } },
  })
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    text: 'Reply',
    reply: { in_reply_to_tweet_id: '22' },
    media: { media_ids: ['52'] },
  })
})

test('image and action inputs reject untrusted URL, mismatched type, oversize alt and invalid IDs', () => {
  for (const image of [
    { dataUrl: 'https://x.com/a.png' },
    { dataUrl: png.replace('image/png', 'image/jpeg') },
    { dataUrl: png, alt: 'z'.repeat(1001) },
    { dataUrl: 'x'.repeat(2800000) },
  ]) {
    assert.throws(() =>
      writeParams('post', { accountId: '17', text: '', image })
    )
  }
  assert.throws(() =>
    writeParams('like', { accountId: '22', postId: '../22', active: true })
  )
  assert.throws(() =>
    writeParams('bookmark', { accountId: '22', postId: '22', active: 'yes' })
  )
  assert.equal(
    writeParams('post', { accountId: '22', text: '', image: { dataUrl: png } })
      .image.alt,
    ''
  )
})

test('toggle requests verify the confirmed state on X', async (t) => {
  const field = {
    likes: 'liked',
    retweets: 'retweeted',
    bookmarks: 'bookmarked',
  }
  const calls = mockApi(t, (url, init) => ({
    data: { [field[url.pathname.split('/')[4]]]: init.method === 'POST' },
  }))
  for (const method of ['like', 'repost', 'bookmark']) {
    for (const active of [true, false]) {
      const params = writeParams(method, {
        accountId: '17',
        postId: '123',
        active,
      })
      assert.deepEqual(await write('fixture', method, params), { active })
      assert.equal(calls.at(-1).options.method, active ? 'POST' : 'DELETE')
    }
  }
})
