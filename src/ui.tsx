import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { BadgeCheck, X } from 'lucide-react'
import type { Account } from './model'

export function Logo() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="brand-x"
      fill="currentColor"
    >
      <path d="M18.9 2h3.3l-7.2 8.2L23.4 22h-6.6l-5.2-7.2L5.3 22H2l8.1-9.3L2 2h6.8l4.8 6.5L18.9 2Zm-1.2 18h1.8L7.8 3.9H5.9L17.7 20Z" />
    </svg>
  )
}
export function Avatar({
  account,
  size = 40,
}: {
  account: Account
  size?: number
}) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {account.avatar ? (
        <img
          src={account.avatar}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.hidden = true
          }}
        />
      ) : null}
      <span>
        {account.name
          .split(' ')
          .map((s) => s[0])
          .slice(0, 2)
          .join('')}
      </span>
    </span>
  )
}
export function Verified({ account }: { account: Account }) {
  return account.verified ? (
    <BadgeCheck size={17} className="verified" aria-label="Verified" />
  ) : null
}

export function Modal({
  title,
  close,
  children,
  className = '',
}: {
  title: string
  close: () => void
  children: ReactNode
  className?: string
}) {
  const el = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dialog = el.current
    if (!dialog) return
    opener.current = document.activeElement as HTMLElement
    dialog.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previous
      opener.current?.focus()
    }
  }, [])
  return (
    <dialog
      ref={el}
      aria-label={title}
      className={'dialog ' + className}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect()
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close()
        }
      }}
    >
      <div className="dialog-head">
        <button
          className="icon-button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={close}
        >
          <X size={21} />
        </button>
        <h2>{title}</h2>
      </div>
      {children}
    </dialog>
  )
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      {children}
    </div>
  )
}

export function timeAgo(date: string) {
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 60000))
  if (mins < 1) return 'now'
  if (mins < 60) return mins + 'm'
  if (mins < 1440) return Math.floor(mins / 60) + 'h'
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
export const count = (n: number | undefined) =>
  n
    ? Intl.NumberFormat('en', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(n)
    : ''
