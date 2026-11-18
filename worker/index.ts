import { FeedFailure, readSource } from './feed.ts'
import type { Snapshot } from './feed.ts'

interface Env {
  ASSETS: Fetcher
  HIGH_SIGNAL: DurableObjectNamespace
  FEED_SOURCE_URL: string
}

const freshFor = 15 * 60 * 1000
const retryAfter = 60 * 1000

function json(
  value: unknown,
  status = 200,
  head = false,
  extra: Record<string, string> = {}
) {
  return new Response(head ? null : JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=30' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...extra,
    },
  })
}

const unavailable = (head: boolean) =>
  json({ error: 'Feed temporarily unavailable' }, 503, head, {
    'Retry-After': '60',
  })

// One object owns the last successful snapshot and coordinates refreshes for all visitors.
export class HighSignalFeed {
  private state: DurableObjectState
  private env: Env
  private pending?: Promise<Snapshot | undefined>
  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }
  private async load(): Promise<Snapshot | undefined> {
    const previousAttempt = await this.state.storage.get<number>('lastAttempt')
    if (previousAttempt && Date.now() - previousAttempt < retryAfter)
      return undefined
    await this.state.storage.put('lastAttempt', Date.now())
    try {
      const snapshot = await readSource(this.env.FEED_SOURCE_URL)
      await this.state.storage.put('snapshot', snapshot)
      return snapshot
    } catch (error) {
      console.error(
        'List refresh:',
        error instanceof FeedFailure
          ? error.message
          : 'Snapshot processing failed'
      )
      return undefined
    }
  }
  async fetch(request: Request) {
    const head = request.method === 'HEAD'
    const snapshot = await this.state.storage.get<Snapshot>('snapshot')
    if (snapshot && Date.now() - Date.parse(snapshot.updatedAt) < freshFor)
      return json(snapshot, 200, head)
    if (!this.pending)
      this.pending = this.load().finally(() => {
        this.pending = undefined
      })
    if (snapshot) {
      this.state.waitUntil(this.pending)
      return json(snapshot, 200, head)
    }
    const initial = await this.pending
    return initial ? json(initial, 200, head) : unavailable(head)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    const head = request.method === 'HEAD'
    if (url.pathname !== '/api/high-signal')
      return json({ error: 'Not found' }, 404, head)
    if (request.method !== 'GET' && !head)
      return json({ error: 'Method not allowed' }, 405, false, {
        Allow: 'GET, HEAD',
      })
    if (url.search)
      return json({ error: 'This endpoint takes no parameters' }, 400, head)
    try {
      return await env.HIGH_SIGNAL.getByName('high-signal').fetch(
        'https://snapshot.internal/',
        { method: request.method }
      )
    } catch {
      return unavailable(head)
    }
  },
} satisfies ExportedHandler<Env>
