import { useState } from 'react'
import {
  Bell,
  Bookmark,
  Check,
  Ellipsis,
  ExternalLink,
  Feather,
  FileText,
  House,
  Mail,
  Search,
  Settings2,
  UserRound,
} from 'lucide-react'
import type { Account } from './model'
import { localAccount } from './model'
import { people, topics } from './preview'
import { Avatar, Logo, Verified } from './ui'

const links = [
  { label: 'Home', to: '/', icon: House },
  { label: 'Explore', to: '/explore', icon: Search },
  { label: 'Notifications', to: '/notifications', icon: Bell },
  { label: 'Messages', to: 'https://x.com/messages', icon: Mail },
  { label: 'Bookmarks', to: '/bookmarks', icon: Bookmark },
  { label: 'Drafts', to: '/drafts', icon: FileText },
  { label: 'Profile', to: '/profile', icon: UserRound },
]

export function Sidebar({
  account,
  path,
  go,
  accounts,
  compose,
  settings,
}: {
  account: Account
  path: string
  go: (to: string) => void
  accounts: () => void
  compose: () => void
  settings: () => void
}) {
  return (
    <>
      <aside className="left-rail">
        <div className="left-inner">
          <a
            className="brand"
            href="/"
            aria-label="SuperTwitter home"
            onClick={(e) => {
              e.preventDefault()
              go('/')
            }}
          >
            <Logo />
            <span>SuperTwitter</span>
          </a>
          <nav aria-label="Main navigation" className="main-nav">
            {links.map(({ label, to, icon: Icon }) =>
              to.startsWith('https:') ? (
                <a
                  className="nav-item"
                  key={to}
                  href={to}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open Messages with the account signed in on x.com"
                  aria-label="Messages (opens X)"
                >
                  <Icon />
                  <span>{label}</span>
                  <ExternalLink className="external-nav" />
                </a>
              ) : (
                <a
                  className={'nav-item ' + (path === to ? 'selected' : '')}
                  key={to}
                  href={to}
                  aria-current={path === to ? 'page' : undefined}
                  title={label}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey) {
                      e.preventDefault()
                      go(to)
                    }
                  }}
                >
                  <Icon />
                  <span>{label}</span>
                </a>
              )
            )}
            <button className="nav-item" onClick={settings} title="Settings">
              <span className="more-symbol">
                <Ellipsis />
              </span>
              <span>More</span>
            </button>
          </nav>
          <button
            className="pill primary main-compose"
            onClick={compose}
            title="Compose a post (N)"
          >
            <Feather />
            <span>Post</span>
          </button>
          <button
            className="identity-switch"
            title="Switch account"
            aria-label="Switch account"
            onClick={accounts}
          >
            <Avatar account={account} />
            <span className="stacked-identity">
              <b>{account.name}</b>
              <small>@{account.username}</small>
            </span>
            <Ellipsis size={19} />
          </button>
        </div>
      </aside>
      <nav aria-label="Mobile navigation" className="mobile-nav">
        {links
          .filter((l) =>
            ['/', '/explore', '/notifications', '/bookmarks'].includes(l.to)
          )
          .map(({ to, label, icon: Icon }) => (
            <button
              className={path === to ? 'selected' : ''}
              key={to}
              aria-label={label}
              aria-current={path === to ? 'page' : undefined}
              onClick={() => go(to)}
            >
              <Icon />
            </button>
          ))}
        <button aria-label="More options" onClick={settings}>
          <Ellipsis />
        </button>
      </nav>
      <button
        className="mobile-compose primary"
        onClick={compose}
        aria-label="Compose a post"
      >
        <Feather />
      </button>
    </>
  )
}

export function SearchBox({
  initial = '',
  search,
  placeholder = 'Search',
  label = 'Search posts',
}: {
  initial?: string
  search: (q: string) => void
  placeholder?: string
  label?: string
}) {
  const [value, setValue] = useState(initial)
  return (
    <form
      className="search-box"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        search(value.trim())
      }}
    >
      <Search size={19} />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </form>
  )
}

export function RightRail({
  account,
  accounts,
  following,
  follow,
  go,
  manage,
  choose,
  settings,
  media,
}: {
  account: Account
  accounts: Account[]
  following: string[]
  follow: (id: string) => void
  go: (to: string) => void
  manage: () => void
  choose: (a: Account) => void
  settings: () => void
  media: boolean
}) {
  const search = (q: string) =>
    go('/explore' + (q ? '?q=' + encodeURIComponent(q) : ''))
  const demo = localAccount(account)
  return (
    <aside className="right-rail">
      <div className="search-sticky">
        <SearchBox search={search} />
      </div>
      {demo ? (
        <>
          <section className="side-card">
            <h2>What’s happening</h2>
            {topics.map((t) => (
              <button
                key={t.name}
                className="trend-row"
                onClick={() => search(t.name)}
              >
                <div>
                  <small>{t.category}</small>
                  <b>{t.name}</b>
                  <small>
                    {t.name === 'Photography' ? '1 post' : '2 posts'}
                  </small>
                </div>
                {media && t.image && (
                  <img src={t.image} alt="" loading="lazy" />
                )}
              </button>
            ))}
            <button className="card-link" onClick={() => go('/explore')}>
              Show more
            </button>
          </section>
          <section className="side-card">
            <h2>Who to follow</h2>
            {[people[2], people[3]].map((p) => (
              <div className="suggest-row" key={p.id}>
                <button
                  className="person-link"
                  onClick={() => go('/user/' + p.username)}
                >
                  <Avatar account={p} />
                  <span className="stacked-identity">
                    <b>
                      {p.name}
                      <Verified account={p} />
                    </b>
                    <small>@{p.username}</small>
                  </span>
                </button>
                <button
                  className={
                    'follow ' + (following.includes(p.id) ? 'following' : '')
                  }
                  onClick={() => follow(p.id)}
                >
                  {following.includes(p.id) ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
          </section>
        </>
      ) : (
        <>
          <section className="side-card">
            <h2>Your accounts</h2>
            {accounts
              .filter((a) => !localAccount(a))
              .map((a) => (
                <button
                  className="account-row"
                  key={a.id}
                  onClick={() => choose(a)}
                >
                  <Avatar account={a} />
                  <span className="stacked-identity">
                    <b>{a.name}</b>
                    <small>@{a.username}</small>
                  </span>
                  {account.id === a.id && <Check size={18} />}
                </button>
              ))}
            <button className="card-link" onClick={manage}>
              Manage accounts
            </button>
          </section>
          <section className="side-card">
            <h2>Quick access</h2>
            <button className="utility-row" onClick={() => go('/drafts')}>
              <FileText />
              Drafts
            </button>
            <button className="utility-row" onClick={() => go('/bookmarks')}>
              <Bookmark />
              Bookmarks
            </button>
            <button className="utility-row" onClick={settings}>
              <Settings2 />
              Display settings
            </button>
          </section>
        </>
      )}
      <footer className="side-foot">
        <span>Independent X client</span>
        <span>·</span>
        <a href="/source.zip" download>
          Source
        </a>
        <span>·</span>
        <button onClick={settings}>Settings</button>
        <span>·</span>
        <button onClick={manage}>Accounts</button>
      </footer>
    </aside>
  )
}
