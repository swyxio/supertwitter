import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CircleAlert, List, LoaderCircle, RefreshCw } from 'lucide-react'
import type { Post } from './model'
import { Empty, timeAgo } from './ui'

type Snapshot = { posts: Post[]; updatedAt: string }

export function HighSignalFeed({
  renderPost,
}: {
  renderPost: (post: Post) => ReactNode
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retry = () => {
    setFailed(false)
    setSnapshot(undefined)
    setAttempt((value) => value + 1)
  }
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/high-signal', {
          headers: { Accept: 'application/json' },
          credentials: 'omit',
          mode: 'same-origin',
          redirect: 'error',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Feed unavailable')
        const data: Snapshot = await response.json()
        if (
          !Array.isArray(data.posts) ||
          !Number.isFinite(Date.parse(data.updatedAt))
        )
          throw new Error('Invalid feed')
        if (!controller.signal.aborted) setSnapshot(data)
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    }
    void load()
    return () => controller.abort()
  }, [attempt])
  if (failed)
    return (
      <div className="feed-error" role="alert">
        <CircleAlert />
        <div>
          <p>Couldn’t load the AI High Signal feed.</p>
          <button className="text-link" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    )
  if (!snapshot)
    return (
      <div className="loading" role="status">
        <LoaderCircle className="animate-spin" />
        Loading AI High Signal…
      </div>
    )
  return (
    <>
      <div className="list-update">
        <span>
          Public posts · Updated{' '}
          <time
            dateTime={snapshot.updatedAt}
            title={new Date(snapshot.updatedAt).toLocaleString()}
          >
            {timeAgo(snapshot.updatedAt)}
          </time>
        </span>
        <button
          className="icon-button"
          aria-label="Refresh AI High Signal"
          title="Refresh list"
          onClick={retry}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {snapshot.posts.length ? (
        snapshot.posts.map(renderPost)
      ) : (
        <Empty icon={<List />} title="No posts in this list yet" />
      )}
    </>
  )
}
