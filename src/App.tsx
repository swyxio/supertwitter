import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Bell,
  Bookmark,
  CircleAlert,
  Feather,
  FileText,
  House,
  LoaderCircle,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { bridge } from './bridge'
import { Composer } from './Composer'
import { readUpload, releaseFile } from './media'
import type { Attachment } from './media'
import { actionField, localAccount, updateAction, zeroMetrics } from './model'
import type { Account, Action, Post } from './model'
import { people, previewAccounts, samplePosts, topics } from './preview'
import { AccountsPanel, SettingsPanel } from './Panels'
import { PostCard, PublicPostCard } from './PostCard'
import { HighSignalFeed } from './HighSignalFeed'
import { RightRail, SearchBox, Sidebar } from './Shell'
import { defaults, emptyWorkspace, useRoute, useStored } from './state'
import { Avatar, Empty, Modal, Verified } from './ui'
import { useLiveFeed } from './useLiveFeed'
import type { Stream } from './useLiveFeed'

type TimelineTab = 'high-signal' | 'following' | 'top'
type Dialog = 'accounts' | 'posting-accounts' | 'settings' | 'compose' | null
const labels: Record<string, string> = {
  '/': 'Home',
  '/explore': 'Explore',
  '/notifications': 'Notifications',
  '/bookmarks': 'Bookmarks',
  '/drafts': 'Drafts',
  '/profile': 'Profile',
}
const decode = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default function App() {
  const [selected, select] = useStored<Account | null>('account', () => null)
  const [connected, setConnected] = useState(false)
  const [liveAccounts, setLiveAccounts] = useState<Account[]>([])
  const [notice, setNotice] = useState('')
  const timer = useRef<number>(undefined)
  const generation = useRef(0)
  const [prefs, changePrefs] = useStored('display', () => defaults)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [pinned, setPinned] = useStored<string[]>('pinnedAccounts', () => [])
  const route = useRoute()
  const account =
    liveAccounts.find((a) => a.id === selected?.id) ??
    selected ??
    previewAccounts[0]
  const all = [...liveAccounts, ...previewAccounts]
  if (!all.some((a) => a.id === account.id)) all.unshift(account)
  const rank = (a: Account) =>
    pinned.includes(a.id) ? pinned.indexOf(a.id) : pinned.length
  all.sort((a, b) => rank(a) - rank(b))
  const notify = useCallback((message: string) => {
    clearTimeout(timer.current)
    setNotice(message)
    timer.current = window.setTimeout(() => setNotice(''), 4400)
  }, [])
  const recheck = async (explicit = false) => {
    const request = ++generation.current
    try {
      await bridge('ping')
      const accounts = await bridge('accounts')
      if (request !== generation.current) return
      setConnected(true)
      setLiveAccounts(accounts)
      if (!selected && accounts.length) select(accounts[0])
      if (
        selected &&
        !localAccount(selected) &&
        !accounts.some((a) => a.id === selected.id)
      ) {
        select(accounts[0] ?? previewAccounts[0])
        notify('That account was disconnected.')
      }
      if (explicit)
        notify(
          accounts.length
            ? 'Connected accounts updated.'
            : 'Connector ready. Connect an X account in the extension.'
        )
    } catch (e) {
      if (request !== generation.current) return
      setConnected(false)
      if (explicit)
        notify(
          (e as Error).message === 'Connector unavailable'
            ? 'Connector unavailable. Install or enable it and reload this tab.'
            : (e as Error).message
        )
    }
  }
  const checkRef = useRef(recheck)
  checkRef.current = recheck
  useEffect(() => {
    void checkRef.current()
    const onFocus = () => {
      void checkRef.current()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearTimeout(timer.current)
    }
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', prefs.theme === 'dark' ? '#000000' : '#ffffff')
  }, [prefs.theme])
  const pick = (a: Account) => {
    select(a)
    setDialog(dialog === 'posting-accounts' ? 'compose' : null)
    if (route.path.startsWith('/post/') || route.path.startsWith('/user/'))
      route.navigate('/')
    if (account.id !== a.id) notify('Switched to @' + a.username)
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.repeat ||
        !/^Digit[1-9]$/.test(event.code)
      )
        return
      if (
        dialog ||
        document.querySelector('dialog[open]') ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)))
      )
        return
      const target = all[Number(event.code.slice(-1)) - 1]
      if (target) {
        event.preventDefault()
        pick(target)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  })
  const go = (url: string) => {
    setDialog(null)
    route.navigate(url)
  }
  return (
    <>
      <WorkspaceView
        key={account.id}
        {...{
          account,
          all,
          prefs,
          dialog,
          setDialog,
          go,
          pick,
          notify,
          route,
          connected,
        }}
      />
      {(dialog === 'accounts' || dialog === 'posting-accounts') && (
        <Modal
          title="Switch accounts"
          close={() =>
            setDialog(dialog === 'posting-accounts' ? 'compose' : null)
          }
        >
          <AccountsPanel
            all={all}
            current={account}
            select={pick}
            pinned={pinned}
            pin={(id) =>
              setPinned((ids) =>
                ids.includes(id)
                  ? ids.filter((item) => item !== id)
                  : [id, ...ids]
              )
            }
            connected={connected}
            recheck={() => void recheck(true)}
            manage={() => void bridge('manage').catch((e) => notify(e.message))}
          />
        </Modal>
      )}
      {dialog === 'settings' && (
        <Modal title="Settings" close={() => setDialog(null)}>
          <SettingsPanel
            prefs={prefs}
            change={changePrefs}
            accounts={() => setDialog('accounts')}
            go={go}
          />
        </Modal>
      )}
      {notice && (
        <div role="status" className="toast">
          {notice}
        </div>
      )}
    </>
  )
}

type WorkspaceProps = {
  account: Account
  all: Account[]
  prefs: typeof defaults
  dialog: Dialog
  connected: boolean
  setDialog: (d: Dialog) => void
  go: (to: string) => void
  pick: (a: Account) => void
  notify: (s: string) => void
  route: ReturnType<typeof useRoute>
}
function WorkspaceView({
  account,
  all,
  prefs,
  dialog,
  setDialog,
  go,
  pick,
  notify,
  route,
  connected,
}: WorkspaceProps) {
  const demo = localAccount(account)
  const [ws, save] = useStored('workspace.' + account.id, emptyWorkspace)
  const [tab, setTab] = useStored<TimelineTab>('tab.' + account.id, () =>
    demo ? 'high-signal' : 'following'
  )
  const [replyTarget, setReplyTarget] = useState<Post | null>(null)
  const [recent, setRecent] = useState<Post[]>([])
  const mounted = useRef(true)
  const publishing = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const path = route.path
  const showList = path === '/' && tab === 'high-signal'
  const timelineTabs: { id: TimelineTab; label: string }[] = demo
    ? [
        { id: 'high-signal', label: 'AI High Signal' },
        { id: 'top', label: 'For you' },
        { id: 'following', label: 'Following' },
      ]
    : [
        { id: 'following', label: 'Following' },
        { id: 'high-signal', label: 'AI High Signal' },
        { id: 'top', label: 'Popular' },
      ]
  const q = route.query.get('q')?.trim() || ''
  const detailId = path.startsWith('/post/') ? decode(path.slice(6)) : ''
  const personSlug = path.startsWith('/user/') ? decode(path.slice(6)) : ''
  const title =
    labels[path] ??
    (detailId ? 'Post' : personSlug ? 'Profile' : 'Page unavailable')
  const stream: Stream = detailId
    ? 'lookup'
    : path === '/bookmarks'
      ? 'bookmarks'
      : path === '/notifications'
        ? 'mentions'
        : path === '/profile'
          ? 'profile'
          : 'timeline'
  const live = useLiveFeed(
    account.id,
    stream,
    detailId,
    !demo &&
      connected &&
      !showList &&
      path !== '/drafts' &&
      Boolean(labels[path] || detailId || personSlug)
  )
  useEffect(() => {
    document.title = title + ' / SuperTwitter'
  }, [title])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        dialog ||
        document.querySelector('dialog[open]') ||
        e.defaultPrevented ||
        e.metaKey ||
        e.altKey ||
        e.ctrlKey ||
        (e.target instanceof HTMLElement &&
          (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName) ||
            e.target.isContentEditable))
      )
        return
      if (e.key === 'n') {
        e.preventDefault()
        setReplyTarget(null)
        setDialog('compose')
      }
      if (e.key === '/') {
        e.preventDefault()
        go('/explore')
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLInputElement>('main input[type=search]')
            ?.focus()
        )
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })
  const localPosts = demo ? [...ws.posts, ...samplePosts] : []
  const raw = demo
    ? localPosts
    : [...new Map([...recent, ...live.posts].map((p) => [p.id, p])).values()]
  const decorate = (p: Post) => {
    let next = p
    for (const action of ['like', 'bookmark', 'repost'] as const) {
      const active = ws.flags[p.id]?.[action]
      if (active !== undefined) next = updateAction(next, action, active)
    }
    return next
  }
  const activePost = raw.find((p) => p.id === detailId)
  const viewedProfile = personSlug
    ? [
        account,
        ...(demo ? [...previewAccounts, ...people] : []),
        ...raw.map((p) => p.author),
      ].find((a) => a.username.toLowerCase() === personSlug.toLowerCase())
    : account
  const rootDraft = 'post'
  const draftKey = replyTarget ? 'reply:' + replyTarget.id : rootDraft
  const draftKeys = [
    ...new Set([...Object.keys(ws.drafts), ...Object.keys(ws.images)]),
  ].filter((k) => ws.drafts[k]?.trim() || ws.images[k])
  const follow = (id: string) =>
    save((w) => ({
      ...w,
      following: w.following.includes(id)
        ? w.following.filter((a) => a !== id)
        : [...w.following, id],
    }))
  const newPost = () => {
    setReplyTarget(null)
    setDialog('compose')
  }
  const switchPanel = () => setDialog('accounts')
  const changeDraft = (key: string, value: string) =>
    save((w) => ({ ...w, drafts: { ...w.drafts, [key]: value } }))
  const attach = (key: string, image?: Attachment) => {
    const old = ws.images[key]
    save((w) => {
      const images = { ...w.images }
      if (image) images[key] = image
      else delete images[key]
      return { ...w, images }
    })
    if (old && old.key !== image?.key) void releaseFile(old.key).catch(() => {})
  }
  const deleteDraft = (key: string) => {
    const old = ws.images[key]
    save((w) => {
      const drafts = { ...w.drafts },
        images = { ...w.images }
      delete drafts[key]
      delete images[key]
      return { ...w, drafts, images }
    })
    if (old) void releaseFile(old.key).catch(() => {})
    setPendingDelete(null)
    notify('Draft deleted.')
  }
  const submitDraft = async (key: string, parent?: Post | null) => {
    const text = (ws.drafts[key] || '').trim(),
      image = ws.images[key]
    if (!text && !image)
      throw new Error('Write something or add an image first.')
    const upload = !demo && image ? await readUpload(image) : undefined
    const id = demo
      ? 'local-' + crypto.randomUUID()
      : (
          await bridge('post', {
            accountId: account.id,
            text,
            replyTo: parent?.id,
            image: upload,
          })
        ).id
    const p: Post = {
      id,
      text,
      createdAt: new Date().toISOString(),
      author: account,
      metrics: zeroMetrics(),
      replyTo: parent?.id,
    }
    if (image) p.media = [{ url: upload?.dataUrl ?? image.key, alt: image.alt }]
    save((w) => {
      const drafts = { ...w.drafts },
        images = { ...w.images }
      if (
        drafts[key] === ws.drafts[key] &&
        images[key]?.key === image?.key &&
        images[key]?.alt === image?.alt
      ) {
        delete drafts[key]
        delete images[key]
      }
      return { ...w, drafts, images, posts: demo ? [p, ...w.posts] : w.posts }
    })
    if (!mounted.current) {
      if (!demo && image) void releaseFile(image.key).catch(() => {})
      notify('Published as @' + account.username)
      return
    }
    if (!demo) {
      setRecent((prev) => [p, ...prev].slice(0, 25))
      if (image) void releaseFile(image.key).catch(() => {})
    }
    setDialog(null)
    setReplyTarget(null)
    notify(
      demo
        ? parent
          ? 'Reply saved to local preview.'
          : 'Posted to local preview.'
        : parent
          ? 'Reply published on X.'
          : 'Post published on X.'
    )
    if (!parent && tab === 'high-signal') setTab(demo ? 'top' : 'following')
    if (parent) go('/post/' + encodeURIComponent(parent.id))
    else if (path !== '/profile') go('/')
  }
  const publish = async (key: string, parent?: Post | null) => {
    if (publishing.current)
      throw new Error(
        'A post is already awaiting confirmation for this account.'
      )
    publishing.current = true
    try {
      await submitDraft(key, parent)
    } finally {
      publishing.current = false
    }
  }
  const toggle = async (p: Post, action: Action) => {
    const requested = !p[actionField[action]]
    try {
      const active = demo
        ? requested
        : (
            await bridge(action, {
              accountId: account.id,
              postId: p.id,
              active: requested,
            })
          ).active
      save((w) => ({
        ...w,
        flags: { ...w.flags, [p.id]: { ...w.flags[p.id], [action]: active } },
      }))
      if (action === 'bookmark')
        notify(active ? 'Added to bookmarks.' : 'Removed from bookmarks.')
    } catch (e) {
      notify((e as Error).message)
    }
  }
  const share = async (p: Post) => {
    const link = demo
      ? location.origin + '/post/' + encodeURIComponent(p.id)
      : 'https://x.com/i/status/' + encodeURIComponent(p.id)
    try {
      await navigator.clipboard.writeText(link)
      notify(
        p.id.startsWith('local-')
          ? 'Local post link copied. It opens in this browser.'
          : 'Post link copied.'
      )
    } catch {
      notify('Clipboard unavailable in this browser.')
    }
  }
  const card = (post: Post) => {
    const p = { ...decorate(post) }
    if (demo)
      p.metrics = {
        ...p.metrics,
        replies:
          p.metrics.replies + ws.posts.filter((r) => r.replyTo === p.id).length,
      }
    return (
      <PostCard
        key={p.id}
        p={p}
        prefs={prefs}
        demo={demo}
        detail={() => go('/post/' + encodeURIComponent(p.id))}
        profile={(u) =>
          go(
            u === account.username
              ? '/profile'
              : '/user/' + encodeURIComponent(u)
          )
        }
        reply={() => {
          setReplyTarget(p)
          setDialog('compose')
        }}
        toggle={toggle}
        share={() => share(p)}
      />
    )
  }
  const compose = (key: string, modal = false, parent?: Post | null) => (
    <Composer
      key={key}
      account={account}
      value={ws.drafts[key] || ''}
      image={ws.images[key]}
      change={(s) => changeDraft(key, s)}
      attach={(a) => attach(key, a)}
      publish={() => publish(key, parent)}
      chooseAccount={modal ? () => setDialog('posting-accounts') : switchPanel}
      modal={modal}
      reply={!!parent}
    />
  )
  const showDraft = (key: string) => {
    if (key === rootDraft) return newPost()
    const id = key.slice(6)
    const known = raw.find((p) => p.id === id)
    if (known) {
      setReplyTarget(known)
      setDialog('compose')
      return
    }
    if (!demo && connected)
      void bridge('lookup', { accountId: account.id, postId: id })
        .then((p) => {
          setReplyTarget(p)
          setDialog('compose')
        })
        .catch((e) => notify(e.message))
    else notify('Reconnect the original account to open this reply.')
  }
  let visible = raw
  if (path === '/') {
    visible = raw.filter(
      (p) =>
        !p.replyTo &&
        (!demo ||
          tab === 'top' ||
          p.author.id === account.id ||
          ws.following.includes(p.author.id))
    )
    if (!demo && tab === 'top')
      visible = [...visible].sort((a, b) => b.metrics.likes - a.metrics.likes)
  } else if (path === '/bookmarks')
    visible = (demo ? raw : live.posts).filter((p) => decorate(p).bookmarked)
  else if (detailId)
    visible = raw.filter((p) => p.id === detailId || p.replyTo === detailId)
  else if (path === '/profile' || personSlug)
    visible = raw.filter((p) => p.author.id === viewedProfile?.id)
  else if (path === '/explore')
    visible = raw.filter((p) =>
      (
        p.text +
        ' ' +
        p.author.name +
        ' @' +
        p.author.username +
        ' ' +
        (p.topic || '')
      )
        .toLowerCase()
        .includes(q.toLowerCase())
    )
  else if (path === '/notifications')
    visible = demo
      ? ws.posts.filter(
          (p) =>
            p.author.id !== account.id &&
            p.text.includes('@' + account.username)
        )
      : live.posts
  const feedError =
    !demo && !connected ? (
      <Empty icon={<UsersRound />} title="Connect your account">
        <p>Open your local connector to load posts for @{account.username}.</p>
        <button className="pill primary" onClick={switchPanel}>
          Manage accounts
        </button>
      </Empty>
    ) : (
      live.error && (
        <div className="feed-error" role="alert">
          <CircleAlert />
          <div>
            <b>Couldn’t load posts</b>
            <p>{live.error}</p>
            <button
              className="text-link"
              onClick={() =>
                void (live.nextToken ? live.more() : live.refresh())
              }
            >
              Try again
            </button>
          </div>
        </div>
      )
    )
  const empty = () => {
    if (path === '/bookmarks')
      return (
        <Empty icon={<Bookmark />} title="Save posts for later">
          <p>
            Use the bookmark on a post to keep it here for @{account.username}.
          </p>
        </Empty>
      )
    if (path === '/notifications')
      return (
        <Empty icon={<Bell />} title="No mentions yet">
          <p>Posts mentioning @{account.username} appear here.</p>
        </Empty>
      )
    if (detailId)
      return (
        <Empty icon={<MessageCircle />} title="Post unavailable">
          <p>
            {demo
              ? 'This preview post isn’t saved on this device.'
              : 'The post is unavailable for this account.'}
          </p>
          {!demo && (
            <a
              className="text-link"
              href={'https://x.com/i/status/' + encodeURIComponent(detailId)}
              target="_blank"
              rel="noreferrer"
            >
              Open on X
            </a>
          )}
        </Empty>
      )
    if (path === '/explore')
      return (
        <Empty icon={<Search />} title="No matching posts">
          <p>Try another name, handle, or phrase.</p>
        </Empty>
      )
    return (
      <Empty icon={<Feather />} title="No posts yet">
        <p>
          {personSlug && !demo
            ? 'No posts by this account in the loaded timeline.'
            : 'Posts for this view will appear here.'}
        </p>
      </Empty>
    )
  }
  return (
    <div className="app-shell">
      <Sidebar
        account={account}
        path={path}
        go={go}
        accounts={switchPanel}
        compose={newPost}
        settings={() => setDialog('settings')}
      />
      <main>
        <header className="feed-header">
          <div className="title-bar">
            {path === '/' ? (
              <button
                className="mobile-account"
                aria-label="Switch account"
                onClick={switchPanel}
              >
                <Avatar account={account} size={32} />
              </button>
            ) : (
              <button
                className="icon-button back"
                aria-label="Back to home"
                onClick={() => go('/')}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h1>{title}</h1>
            {demo && (
              <button
                className="preview-chip"
                title="Using a local preview account. Connect an X account."
                onClick={switchPanel}
              >
                <span />
                {showList ? 'Preview account' : 'Local preview'}
              </button>
            )}
            <button
              className="icon-button display-settings"
              title="Timeline settings"
              aria-label="Timeline settings"
              onClick={() => setDialog('settings')}
            >
              <SlidersHorizontal size={19} />
            </button>
          </div>
          {path === '/' && (
            <div className="feed-tabs" aria-label="Timelines">
              {timelineTabs.map(({ id, label }) => (
                <button
                  key={id}
                  className={tab === id ? 'active' : ''}
                  aria-pressed={tab === id}
                  title={
                    id === 'top' && !demo
                      ? 'Loaded following posts sorted by like count'
                      : undefined
                  }
                  onClick={() => setTab(id)}
                >
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </header>
        {path === '/' && compose(rootDraft)}
        {path === '/explore' && (
          <div className="explore-search">
            <SearchBox
              key={q}
              initial={q}
              placeholder={
                demo ? 'Search posts and people' : 'Search loaded posts'
              }
              label="Search timeline"
              search={(s) =>
                go('/explore' + (s ? '?q=' + encodeURIComponent(s) : ''))
              }
            />
            {demo && !q && (
              <div className="topic-pills">
                {topics.map((t) => (
                  <button
                    key={t.name}
                    onClick={() =>
                      go('/explore?q=' + encodeURIComponent(t.name))
                    }
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {(path === '/profile' || personSlug) && (
          <div className="profile-top">
            {viewedProfile ? (
              <>
                <div className="profile-cover" />
                <div className="profile-info">
                  <Avatar account={viewedProfile} size={70} />
                  {viewedProfile.id === account.id ? (
                    <button className="pill outline" onClick={switchPanel}>
                      Switch account
                    </button>
                  ) : demo ? (
                    <button
                      className="pill outline"
                      onClick={() => follow(viewedProfile.id)}
                    >
                      {ws.following.includes(viewedProfile.id)
                        ? 'Following'
                        : 'Follow'}
                    </button>
                  ) : null}
                  <h2>
                    {viewedProfile.name}
                    <Verified account={viewedProfile} />
                  </h2>
                  <p>@{viewedProfile.username}</p>
                  {!demo && (
                    <a
                      className="text-link"
                      href={
                        'https://x.com/' +
                        encodeURIComponent(viewedProfile.username)
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on X
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div className="profile-info">
                <h2>@{personSlug}</h2>
                {!demo && (
                  <a
                    className="text-link"
                    href={'https://x.com/' + encodeURIComponent(personSlug)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on X
                  </a>
                )}
              </div>
            )}
          </div>
        )}
        {path === '/notifications' && <h2 className="subheading">Mentions</h2>}
        {showList ? (
          <HighSignalFeed
            renderPost={(p) =>
              demo || !connected ? (
                <PublicPostCard key={p.id} p={p} prefs={prefs} />
              ) : (
                card(p)
              )
            }
          />
        ) : path === '/drafts' ? (
          draftKeys.length ? (
            draftKeys.map((k) => (
              <div className="draft-row" key={k}>
                <button onClick={() => showDraft(k)}>
                  <span>{k === rootDraft ? 'Post' : 'Reply'} draft</span>
                  <p>{ws.drafts[k] || 'Image attachment'}</p>
                </button>
                <button
                  className="icon-button"
                  title="Delete draft"
                  aria-label="Delete draft"
                  onClick={() => setPendingDelete(k)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          ) : (
            <Empty icon={<FileText />} title="No drafts yet">
              <p>
                Unfinished posts and replies for @{account.username} are saved
                here as you type.
              </p>
              <button className="pill primary" onClick={newPost}>
                Write a post
              </button>
            </Empty>
          )
        ) : !labels[path] && !detailId && !personSlug ? (
          <Empty icon={<House />} title="Page unavailable">
            <button className="text-link" onClick={() => go('/')}>
              Go to Home
            </button>
          </Empty>
        ) : (
          <>
            {feedError}
            {(!feedError || connected) &&
              (visible.length
                ? (detailId && activePost
                    ? [activePost, ...visible.filter((p) => p.id !== detailId)]
                    : visible
                  ).map(card)
                : !live.loading && !feedError && empty())}
            {live.loading && (
              <div className="loading" role="status">
                <LoaderCircle className="animate-spin" />
                Loading posts…
              </div>
            )}
            {live.nextToken && !live.loading && (
              <button className="load-more" onClick={() => void live.more()}>
                Load more posts
              </button>
            )}
          </>
        )}
      </main>
      <RightRail
        account={account}
        accounts={all}
        following={ws.following}
        follow={follow}
        go={go}
        manage={switchPanel}
        choose={pick}
        settings={() => setDialog('settings')}
        media={prefs.media}
        showList={showList}
      />
      {dialog === 'compose' && (
        <Modal
          title={replyTarget ? 'Reply' : 'Compose post'}
          close={() => setDialog(null)}
        >
          {replyTarget && (
            <div className="reply-context">
              <Avatar account={replyTarget.author} size={32} />
              <div>
                <b>{replyTarget.author.name}</b>
                <p>{replyTarget.text}</p>
              </div>
            </div>
          )}
          {compose(draftKey, true, replyTarget)}
        </Modal>
      )}
      {pendingDelete && (
        <Modal title="Delete draft?" close={() => setPendingDelete(null)}>
          <div className="panel-body">
            <p>This removes the saved draft from this device.</p>
            <div className="dialog-actions">
              <button
                className="pill outline"
                onClick={() => setPendingDelete(null)}
              >
                Keep draft
              </button>
              <button
                className="pill danger"
                onClick={() => deleteDraft(pendingDelete)}
              >
                Delete draft
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
