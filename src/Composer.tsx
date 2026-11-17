import { useEffect, useRef, useState } from 'react'
import {
  AtSign,
  ChevronDown,
  ExternalLink,
  Hash,
  ImagePlus,
  Smile,
  X,
} from 'lucide-react'
import { Avatar } from './ui'
import { localAccount, type Account } from './model'
import { saveFile, useImageUrl } from './media'
import type { Attachment } from './media'

type Props = {
  account: Account
  value: string
  image?: Attachment
  change: (text: string) => void
  attach: (attachment?: Attachment) => void
  publish: () => Promise<void>
  chooseAccount: () => void
  modal?: boolean
  reply?: boolean
}

export function Composer({
  account,
  value,
  image,
  change,
  attach,
  publish,
  chooseAccount,
  modal,
  reply,
}: Props) {
  const area = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [emoji, setEmoji] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [parsed, setParsed] = useState({ text: '', count: 0, valid: true })
  const attachmentUrl = useImageUrl(image?.key || '')
  useEffect(() => {
    let alive = true
    if (!value) setParsed({ text: '', count: 0, valid: true })
    else
      import('twitter-text/dist/esm/parseTweet.js')
        .then(({ default: parseTweet }) => {
          const parsed = parseTweet(value)
          if (alive)
            setParsed({
              text: value,
              count: parsed.weightedLength,
              valid: parsed.valid,
            })
        })
        .catch(() => {
          if (alive)
            setError('Could not load the text counter. Refresh and try again.')
        })
    return () => {
      alive = false
    }
  }, [value])
  useEffect(() => {
    if (modal) area.current?.focus()
  }, [modal])
  useEffect(() => {
    if (area.current) {
      area.current.style.height = 'auto'
      area.current.style.height = area.current.scrollHeight + 'px'
    }
  }, [value, modal])
  const canSend =
    parsed.text === value &&
    (Boolean(value.trim()) || Boolean(image)) &&
    parsed.valid &&
    !working
  const insert = (text: string) => {
    const start = area.current?.selectionStart ?? value.length
    const end = area.current?.selectionEnd ?? start
    change(value.slice(0, start) + text + value.slice(end))
    setEmoji(false)
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(start + text.length, start + text.length)
    })
  }
  const submit = async () => {
    if (!canSend) return
    setWorking(true)
    setError('')
    try {
      await publish()
      setEmoji(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }
  return (
    <div className={'composer ' + (modal ? 'composer-modal' : '')}>
      <button
        className="avatar-trigger"
        title="Choose posting account"
        aria-label="Choose posting account"
        disabled={working}
        onClick={chooseAccount}
      >
        <Avatar account={account} />
      </button>
      <div className="composer-body">
        {modal && (
          <div className="composer-byline">
            {account.name} <span>@{account.username}</span>
          </div>
        )}
        <textarea
          ref={area}
          aria-label={reply ? 'Reply text' : 'Post text'}
          rows={1}
          placeholder={reply ? 'Post your reply' : 'What’s happening?'}
          value={value}
          disabled={working}
          onChange={(e) => {
            setError('')
            change(e.target.value)
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
        />
        {image && (
          <div className="composer-image">
            {attachmentUrl && (
              <img src={attachmentUrl} alt={image.alt || 'Attached image'} />
            )}
            <button
              className="remove-image"
              title="Remove image"
              aria-label="Remove image"
              disabled={working}
              onClick={() => attach(undefined)}
            >
              <X size={16} />
            </button>
            <input
              aria-label="Image description"
              maxLength={1000}
              placeholder="Add image description"
              value={image.alt}
              disabled={working}
              onChange={(e) => attach({ ...image, alt: e.target.value })}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="compose-bar">
          <div className="compose-tools">
            <button
              aria-label="Attach image"
              title="Attach image (up to 2 MiB)"
              disabled={working}
              onClick={() => picker.current?.click()}
            >
              <ImagePlus />
            </button>
            <input
              hidden
              ref={picker}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0]
                e.currentTarget.value = ''
                if (!file) return
                setWorking(true)
                try {
                  attach(await saveFile(file))
                  setError('')
                } catch (err) {
                  setError((err as Error).message)
                } finally {
                  setWorking(false)
                }
              }}
            />
            <button
              aria-label="Emoji"
              title="Add emoji"
              aria-expanded={emoji}
              disabled={working}
              onClick={() => setEmoji(!emoji)}
            >
              <Smile />
            </button>
            <button
              aria-label="Add hashtag"
              title="Add hashtag"
              disabled={working}
              onClick={() => insert('#')}
            >
              <Hash />
            </button>
            <button
              aria-label="Mention an account"
              title="Mention an account"
              disabled={working}
              onClick={() => insert('@')}
            >
              <AtSign />
            </button>
            <button
              aria-label="Switch posting account"
              title="Switch posting account"
              disabled={working}
              onClick={chooseAccount}
            >
              <ChevronDown />
            </button>
          </div>
          <div className="send-group">
            {value && (
              <span
                className={
                  'remaining ' + (parsed.count > 280 ? 'over-limit' : '')
                }
                aria-label="Characters remaining"
              >
                {280 - parsed.count}
              </span>
            )}
            <button
              className="pill primary post-submit"
              title={reply ? 'Reply (⌘/Ctrl+Enter)' : 'Post (⌘/Ctrl+Enter)'}
              disabled={!canSend}
              onClick={() => void submit()}
            >
              {working ? 'Working…' : reply ? 'Reply' : 'Post'}
            </button>
          </div>
        </div>
        {localAccount(account) && !reply && !image && value.trim() && (
          <div className="intent-row">
            <a
              href={
                'https://x.com/intent/tweet?' +
                new URLSearchParams({ text: value }).toString()
              }
              target="_blank"
              rel="noopener noreferrer"
              title="Review this text with the account signed in on x.com"
            >
              Continue on X <ExternalLink size={13} />
            </a>
            <span>Uses your signed-in X account</span>
          </div>
        )}
        {emoji && (
          <div
            className="emoji-picker"
            aria-label="Choose an emoji"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEmoji(false)
            }}
          >
            {['😀', '✨', '💙', '👀', '🚀', '🙌', '📸', '🌁'].map((g) => (
              <button key={g} onClick={() => insert(g)}>
                {g}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
