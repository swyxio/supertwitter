import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeList, readSource } from '../feed.ts'
import worker, { HighSignalFeed } from '../index.ts'

const origin = 'https://reader.example'
const source = origin + '/i/lists/12345'
const options = { FEED_SOURCE_URL: source }
const fixture = `<div class="timeline"><article class="timeline-item"><div class="tweet-body">
  <div class="retweet-header">@curator reposted</div><a class="tweet-link" href="/original/status/123"></a>
  <header class="tweet-header"><a class="tweet-avatar"><img src="https://pbs.twimg.com/profile_images/123/avatar.jpg"></a>
  <a class="fullname">Ada &amp; Co.</a><span class="tweet-date"><a title="2026-10-31T12:30:00Z"></a></span></header>
  <p class="tweet-content">One<br>two. See reader.example. <script>private-hint</script></p>
  <div class="quote"><a class="quote-link" href="/quoted/status/987"></a><p class="quote-text">Quoted text</p></div>
  <div class="attachments"><img src="https://pbs.twimg.com/media/photo.jpg?name=large&amp;secret=drop" alt="a photo">
  <img src="https://reader.example/tracker"><video poster="https://pbs.twimg.com/ext_tw_video_thumb/456/one.jpg"></video></div>
  <div class="tweet-stats"><span class="tweet-stat"><span class="icon-heart"></span>1.2K</span>
  <span class="tweet-stat"><span class="icon-comment"></span>2</span></div></div></article></div>`
async function upstream() {
  return new Response(fixture, {
    headers: {
      'Content-Type': 'text/html',
      'Set-Cookie': 'fixture=private',
      'X-Internal-Hint': origin,
    },
  })
}
function state(values = new Map()) {
  const tasks = []
  return {
    values,
    tasks,
    storage: {
      async get(k) {
        return values.get(k)
      },
      async put(k, v) {
        values.set(k, v)
      },
    },
    waitUntil(p) {
      tasks.push(p)
    },
  }
}
const incoming = () => new Request('https://snapshot.internal/')

test('list rows are normalized into canonical posts, with duplicate IDs and private metadata removed', () => {
  const posts = normalizeList(
    fixture.replace(
      '</article>',
      '</article>' + fixture.match(/<article[\s\S]*?<\/article>/)[0]
    ),
    new URL(source)
  )
  assert.equal(posts.length, 1)
  const [p] = posts
  assert.equal(p.id, '123')
  assert.deepEqual(p.author, {
    id: 'x-handle:original',
    username: 'original',
    name: 'Ada & Co.',
    avatar: 'https://pbs.twimg.com/profile_images/123/avatar.jpg',
  })
  assert.equal(p.repostedBy, 'curator')
  assert.equal(p.text, 'One\ntwo. See x.com.')
  assert.equal(p.quote.author.username, 'quoted')
  assert.equal(p.createdAt, '2026-10-31T12:30:00.000Z')
  assert.deepEqual(p.metrics, { likes: 1200, replies: 2, reposts: 0 })
  assert.deepEqual(
    p.media.map((m) => m.type),
    ['photo', 'video']
  )
  assert.doesNotMatch(
    JSON.stringify(posts),
    /reader\.example|secret=|private-hint|tracker/
  )
  assert.throws(() =>
    normalizeList('<html>Authorization required</html>', new URL(source))
  )
  assert.throws(() =>
    normalizeList(
      fixture.replace(
        '/original/status/123',
        'https://bad.example/original/status/123'
      ),
      new URL(source)
    )
  )
})

test('the public endpoint never forwards client headers, parameters, methods or paths', async () => {
  const calls = []
  const env = {
    ASSETS: {
      fetch() {
        return new Response('static')
      },
    },
    HIGH_SIGNAL: {
      getByName(name) {
        assert.equal(name, 'high-signal')
        return {
          fetch(url, init) {
            calls.push({ url, init })
            return Response.json({ posts: [] })
          },
        }
      },
    },
  }
  async function send(path, method = 'GET') {
    return worker.fetch(
      new Request('https://app.example' + path, {
        method,
        headers: { Cookie: 'private', Authorization: 'secret' },
      }),
      env
    )
  }
  assert.equal((await send('/api/unlisted')).status, 404)
  assert.equal(
    (await send('/api/high-signal?url=https%3A%2F%2Fother.example')).status,
    400
  )
  assert.equal((await send('/api/high-signal', 'POST')).status, 405)
  assert.equal(await (await send('/bookmarks')).text(), 'static')
  assert.equal(calls.length, 0)
  await send('/api/high-signal')
  assert.deepEqual(calls, [
    { url: 'https://snapshot.internal/', init: { method: 'GET' } },
  ])
})

test('cold visitors share a single read; fresh snapshots survive object restart', async (t) => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const fetcher = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, source)
    assert.equal(init.redirect, 'manual')
    assert.equal(init.method, 'GET')
    assert.deepEqual(Object.keys(init.headers).sort(), ['Accept', 'User-Agent'])
    await gate
    return upstream()
  })
  const storage = state()
  const object = new HighSignalFeed(storage, options)
  const pending = [object.fetch(incoming()), object.fetch(incoming())]
  release()
  for (const r of await Promise.all(pending)) {
    assert.equal(r.status, 200)
    assert.equal((await r.json()).posts.length, 1)
    assert.equal(r.headers.get('set-cookie'), null)
    assert.equal(r.headers.get('x-internal-hint'), null)
  }
  const restored = new HighSignalFeed(state(storage.values), options)
  const head = await restored.fetch(new Request(incoming(), { method: 'HEAD' }))
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.equal(fetcher.mock.callCount(), 1)
})

test('an upstream outage serves the last good snapshot and backs off', async (t) => {
  const fetcher = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error(origin + ' private diagnostic')
  })
  const previous = {
    posts: normalizeList(fixture, new URL(source)),
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const s = state(new Map([['snapshot', previous]]))
  const object = new HighSignalFeed(s, options)
  assert.deepEqual(await (await object.fetch(incoming())).json(), previous)
  await Promise.all(s.tasks)
  assert.deepEqual(await (await object.fetch(incoming())).json(), previous)
  await Promise.all(s.tasks)
  assert.equal(fetcher.mock.callCount(), 1)
  const empty = new HighSignalFeed(state(), options)
  const failure = await empty.fetch(incoming())
  assert.equal(failure.status, 503)
  assert.equal(failure.headers.get('retry-after'), '60')
  assert.deepEqual(await failure.json(), {
    error: 'Feed temporarily unavailable',
  })
})

test('configured list reads reject redirects, wrong content, invalid URLs and oversized documents', async (t) => {
  for (const url of [
    'http://reader.example/i/lists/1',
    source + '?key=forbidden',
    'https://reader.example/search',
  ]) {
    await assert.rejects(() => readSource(url), /Invalid list configuration/)
  }
  const f = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 302, headers: { Location: origin } })
  )
  await assert.rejects(() => readSource(source), /unavailable/)
  f.mock.mockImplementation(async () => Response.json({ error: 'private' }))
  await assert.rejects(() => readSource(source), /unavailable/)
  f.mock.mockImplementation(
    async () =>
      new Response('a'.repeat(1024 * 1024 + 1), {
        headers: { 'Content-Type': 'text/html' },
      })
  )
  await assert.rejects(() => readSource(source), /too large/)
  f.mock.mockImplementation(upstream)
  const s = await readSource(source)
  assert.equal(s.posts.length, 1)
  assert.ok(Number.isFinite(Date.parse(s.updatedAt)))
})
