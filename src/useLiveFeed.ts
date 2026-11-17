import { useCallback, useEffect, useRef, useState } from 'react'
import { bridge } from './bridge'
import type { Feed, Post } from './model'

export type Stream =
  | 'timeline'
  | 'bookmarks'
  | 'mentions'
  | 'profile'
  | 'lookup'
export function useLiveFeed(
  accountId: string,
  stream: Stream,
  postId: string,
  enabled: boolean
) {
  const [feed, setFeed] = useState<Feed>({ posts: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const pending = useRef(false)
  const fetchPage = useCallback(
    async (token?: string) => {
      if (!enabled || (pending.current && token)) return
      const request = ++generation.current
      pending.current = true
      setLoading(true)
      setError('')
      if (!token) setFeed({ posts: [] })
      try {
        const page: Feed =
          stream === 'lookup'
            ? { posts: [await bridge('lookup', { accountId, postId })] }
            : await bridge(stream, { accountId, paginationToken: token })
        if (request === generation.current)
          setFeed((prev) => {
            const merged = new Map<string, Post>()
            for (const p of [...(token ? prev.posts : []), ...page.posts])
              merged.set(
                p.id,
                stream === 'bookmarks' ? { ...p, bookmarked: true } : p
              )
            return { posts: [...merged.values()], nextToken: page.nextToken }
          })
      } catch (e) {
        if (request === generation.current) setError((e as Error).message)
      } finally {
        if (request === generation.current) {
          pending.current = false
          setLoading(false)
        }
      }
    },
    [accountId, stream, postId, enabled]
  )
  useEffect(() => {
    setFeed({ posts: [] })
    setError('')
    setLoading(false)
    void fetchPage()
    return () => {
      generation.current++
      pending.current = false
    }
  }, [fetchPage])
  return {
    ...feed,
    loading,
    error,
    refresh: () => fetchPage(),
    more: () => fetchPage(feed.nextToken),
  }
}
