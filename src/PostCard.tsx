import { useState } from 'react'
import {
  BarChart3,
  Bookmark,
  Check,
  Copy,
  Ellipsis,
  ExternalLink,
  Heart,
  MessageCircle,
  Repeat2,
  Share,
} from 'lucide-react'
import { Avatar, count, Modal, timeAgo, Verified } from './ui'
import type { Action, Post } from './model'
import { actionField } from './model'
import { useImageUrl } from './media'
import type { Preferences } from './state'

function Picture({
  url,
  alt,
  open,
}: {
  url: string
  alt: string
  open: (src: string, alt: string) => void
}) {
  const src = useImageUrl(url)
  return src ? (
    <button
      className="photo"
      aria-label="Expand photo"
      onClick={() => open(src, alt)}
    >
      <img
        loading="lazy"
        decoding="async"
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
      />
    </button>
  ) : null
}

export function PostCard({
  p,
  prefs,
  profile,
  detail,
  reply,
  toggle,
  share,
  demo,
}: {
  p: Post
  prefs: Preferences
  profile: (username: string) => void
  detail: () => void
  reply: () => void
  toggle: (p: Post, action: Action) => Promise<void>
  share: () => Promise<void>
  demo: boolean
}) {
  const [busy, setBusy] = useState('')
  const [menu, setMenu] = useState(false)
  const [photo, setPhoto] = useState<{ src: string; alt: string } | null>(null)
  const run = async (name: Action) => {
    if (busy) return
    setBusy(name)
    try {
      await toggle(p, name)
    } finally {
      setBusy('')
    }
  }
  const action = (
    name: Action,
    icon: React.ReactNode,
    label: string,
    total?: number,
    toggleLabel?: string
  ) => (
    <button
      className={'action ' + name + (p[actionField[name]] ? ' active' : '')}
      aria-label={p[actionField[name]] ? toggleLabel : label}
      title={p[actionField[name]] ? toggleLabel : label}
      aria-pressed={!!p[actionField[name]]}
      disabled={!!busy}
      onClick={() => void run(name)}
    >
      {icon}
      {prefs.metrics && count(total)}
    </button>
  )
  return (
    <article className={'post-card ' + (prefs.compact ? 'compact' : '')}>
      <button
        className="avatar-trigger"
        title={'View @' + p.author.username}
        onClick={() => profile(p.author.username)}
      >
        <Avatar account={p.author} />
      </button>
      <div className="post-body">
        <div className="post-head">
          <button
            className="identity"
            onClick={() => profile(p.author.username)}
          >
            <b>{p.author.name}</b>
            <Verified account={p.author} />
            <span>@{p.author.username}</span>
          </button>
          <span className="dot">·</span>
          <button
            className="time"
            title={new Date(p.createdAt).toLocaleString()}
            onClick={detail}
          >
            {timeAgo(p.createdAt)}
          </button>
          <button
            className="post-more"
            title="Post options"
            aria-label="Post options"
            onClick={() => setMenu(true)}
          >
            <Ellipsis size={19} />
          </button>
        </div>
        <div className="post-text" onClick={detail}>
          {p.text.split(/(https?:\/\/[^\s]+)/g).map((s, i) =>
            /^https?:\/\//.test(s) ? (
              <a
                key={i}
                href={s}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {s}
              </a>
            ) : (
              s
            )
          )}
        </div>
        {prefs.media &&
          p.media?.map((m, i) => (
            <Picture
              key={m.url + i}
              url={m.url}
              alt={
                m.alt ||
                (m.type === 'video' ? 'Video preview on X' : 'Post media')
              }
              open={(src, alt) => setPhoto({ src, alt })}
            />
          ))}
        {p.quote && (
          <div className="quote">
            <b>{p.quote.author.name}</b>
            <span> @{p.quote.author.username}</span>
            <p>{p.quote.text}</p>
          </div>
        )}
        <div className="post-actions">
          <button
            className="action reply"
            aria-label="Reply"
            title="Reply"
            onClick={reply}
          >
            <MessageCircle />
            {prefs.metrics && count(p.metrics.replies)}
          </button>
          {action(
            'repost',
            <Repeat2 />,
            'Repost',
            p.metrics.reposts,
            'Undo repost'
          )}
          {action('like', <Heart />, 'Like', p.metrics.likes, 'Unlike')}
          {prefs.metrics && p.metrics.views !== undefined && (
            <span
              className="action views"
              title={p.metrics.views.toLocaleString() + ' views'}
              aria-label={p.metrics.views + ' views'}
            >
              <BarChart3 />
              {count(p.metrics.views)}
            </span>
          )}
          <span className="post-secondary">
            {action(
              'bookmark',
              <Bookmark />,
              'Bookmark',
              undefined,
              'Remove bookmark'
            )}
            <button
              className="action share"
              aria-label="Share post"
              title="Copy link"
              onClick={() => void share()}
            >
              <Share />
            </button>
          </span>
        </div>
      </div>
      {menu && (
        <Modal title="Post options" close={() => setMenu(false)}>
          <div className="menu-list">
            <button
              onClick={() => {
                setMenu(false)
                detail()
              }}
            >
              <MessageCircle />
              View post
            </button>
            <button
              onClick={() => {
                setMenu(false)
                void share()
              }}
            >
              <Copy />
              Copy link
            </button>
            <button
              onClick={() => {
                setMenu(false)
                void run('bookmark')
              }}
            >
              {p.bookmarked ? <Check /> : <Bookmark />}
              {p.bookmarked ? 'Remove bookmark' : 'Bookmark post'}
            </button>
            {!demo && (
              <a
                href={'https://x.com/i/status/' + encodeURIComponent(p.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink />
                Open post on X
              </a>
            )}
          </div>
        </Modal>
      )}
      {photo && (
        <Modal
          title="Photo"
          close={() => setPhoto(null)}
          className="photo-dialog"
        >
          <img src={photo.src} alt={photo.alt} />
          <p>{photo.alt}</p>
        </Modal>
      )}
    </article>
  )
}
