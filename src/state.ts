import { useCallback, useEffect, useState } from 'react'
import type { Attachment } from './media'
import type { Action, Post } from './model'

export interface Workspace {
  drafts: Record<string, string>
  images: Record<string, Attachment>
  posts: Post[]
  flags: Record<string, Partial<Record<Action, boolean>>>
  following: string[]
}
export const emptyWorkspace = (): Workspace => ({
  drafts: {},
  images: {},
  posts: [],
  flags: {},
  following: ['maya', 'theo'],
})
export interface Preferences {
  theme: 'dark' | 'light'
  compact: boolean
  media: boolean
  metrics: boolean
}
export const defaults: Preferences = {
  theme: 'dark',
  compact: false,
  media: true,
  metrics: true,
}

export function useStored<T>(key: string, initial: () => T) {
  const read = useCallback(() => {
    try {
      const raw = localStorage.getItem('superTwitter.' + key)
      return raw ? (JSON.parse(raw) as T) : initial()
    } catch {
      return initial()
    }
  }, [key])
  const [value, setValue] = useState<T>(read)
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === 'superTwitter.' + key || e.key === null) setValue(read())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [key, read])
  const change = (next: T | ((old: T) => T)) => {
    const resolved =
      typeof next === 'function' ? (next as (old: T) => T)(read()) : next
    try {
      localStorage.setItem('superTwitter.' + key, JSON.stringify(resolved))
    } catch {
      throw new Error(
        'This browser could not save your changes. Check its storage settings.'
      )
    }
    setValue(resolved)
  }
  return [value, change] as const
}

export function useRoute() {
  const read = () => location.pathname + location.search
  const [url, setUrl] = useState(read)
  useEffect(() => {
    const sync = () => setUrl(read())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  const navigate = (to: string) => {
    if (to !== read()) history.pushState(null, '', to)
    setUrl(read())
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const [path, query] = url.split('?')
  return { path, query: new URLSearchParams(query), navigate }
}
