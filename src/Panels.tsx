import {
  Check,
  Download,
  ExternalLink,
  FileText,
  Pin,
  Plus,
  UserRound,
  UsersRound,
} from 'lucide-react'
import type { Account } from './model'
import { localAccount } from './model'
import type { Preferences } from './state'
import { Avatar } from './ui'

export function AccountsPanel({
  all,
  current,
  select,
  pinned,
  pin,
  connected,
  manage,
  recheck,
}: {
  all: Account[]
  current: Account
  select: (a: Account) => void
  pinned: string[]
  pin: (id: string) => void
  connected: boolean
  manage: () => void
  recheck: () => void
}) {
  return (
    <div className="panel-body">
      {all.map((a, index) => (
        <div className="switch-row" key={a.id}>
          <button className="account-row" onClick={() => select(a)}>
            <Avatar account={a} />
            <span className="stacked-identity">
              <b>{a.name}</b>
              <small>
                @{a.username}
                {localAccount(a) ? ' · Local preview' : ''}
              </small>
            </span>
            {index < 9 && (
              <kbd className="account-shortcut">⌥/Alt {index + 1}</kbd>
            )}
            {current.id === a.id && <Check className="blue" size={19} />}
          </button>
          <button
            className="icon-button pin-account"
            aria-pressed={pinned.includes(a.id)}
            aria-label={
              (pinned.includes(a.id) ? 'Unpin @' : 'Pin @') + a.username
            }
            title={pinned.includes(a.id) ? 'Unpin account' : 'Pin to the top'}
            onClick={() => pin(a.id)}
          >
            <Pin size={16} />
          </button>
        </div>
      ))}
      <div className="setup-card">
        <h3>{connected ? 'Local X connector' : 'Connect an X account'}</h3>
        <p>
          {connected
            ? 'Authorize another account or remove one in the extension.'
            : 'The Chrome connector keeps account tokens on this device. You’ll need an X developer app with API access.'}
        </p>
        {connected ? (
          <button className="pill primary" onClick={manage}>
            <Plus size={17} />
            Manage X accounts
          </button>
        ) : (
          <>
            <ol>
              <li>
                <a download href="/connector.zip">
                  Download the connector
                </a>{' '}
                and unzip it.
              </li>
              <li>
                Open <code>chrome://extensions</code>, turn on Developer mode,
                and choose <b>Load unpacked</b> with the extracted folder.
              </li>
              <li>
                Open the extension. Register its callback in your X developer
                app, enter the public client ID, then choose <b>Connect</b>.
              </li>
            </ol>
            <p>
              For local development, enable localhost access in the connector.
            </p>
            <a className="pill primary" download href="/connector.zip">
              <Download size={16} />
              Download connector
            </a>
          </>
        )}
        <button className="text-link recheck" onClick={recheck}>
          Check connection
        </button>
      </div>
    </div>
  )
}

export function SettingsPanel({
  prefs,
  change,
  accounts,
  go,
}: {
  prefs: Preferences
  change: (p: Preferences) => void
  accounts: () => void
  go: (to: string) => void
}) {
  return (
    <div className="panel-body settings-panel">
      <h3>Display</h3>
      <div className="theme-choice">
        {(['dark', 'light'] as const).map((t) => (
          <button
            aria-pressed={prefs.theme === t}
            className={prefs.theme === t ? 'chosen' : ''}
            key={t}
            onClick={() => change({ ...prefs, theme: t })}
          >
            <span className={'theme-dot ' + t} />
            {t === 'dark' ? 'Lights out' : 'Default light'}
            {prefs.theme === t && <Check size={15} />}
          </button>
        ))}
      </div>
      {(
        [
          ['compact', 'Compact timeline', 'Reduce spacing between posts.'],
          ['media', 'Show media', 'Load photos and media previews.'],
          [
            'metrics',
            'Engagement counts',
            'Show replies, likes, reposts and views.',
          ],
        ] as const
      ).map(([key, label, hint]) => (
        <label key={key} className="setting-row">
          <span>
            <b>{label}</b>
            <small>{hint}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={prefs[key]}
            onChange={(e) => change({ ...prefs, [key]: e.target.checked })}
          />
        </label>
      ))}
      <h3>Workspace</h3>
      <div className="menu-list">
        <a
          href="https://github.com/swyxio/supertwitter"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink />
          View source on GitHub
        </a>
        <a href="/source.zip" download>
          <Download />
          Download source for local use
        </a>
        <button onClick={accounts}>
          <UsersRound />
          Switch or connect accounts
        </button>
        <button onClick={() => go('/drafts')}>
          <FileText />
          Saved drafts
        </button>
        <button onClick={() => go('/profile')}>
          <UserRound />
          Your profile
        </button>
        <a
          href="https://x.com/messages"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink />
          Messages on X
        </a>
      </div>
      <p className="shortcuts">
        <kbd>⌥/Alt 1–9</kbd> Switch account <kbd>N</kbd> Compose <kbd>/</kbd>{' '}
        Search <kbd>⌘/Ctrl ↵</kbd> Post
      </p>
    </div>
  )
}
