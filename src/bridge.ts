import type { Upload } from './media'
import type { Account, Action, Feed, Post } from './model'

type Calls = {
  ping: [undefined, { version: string }]
  accounts: [undefined, Account[]]
  manage: [undefined, unknown]
  lookup: [{ accountId: string; postId: string }, Post]
  timeline: [{ accountId: string; paginationToken?: string }, Feed]
  profile: [{ accountId: string; paginationToken?: string }, Feed]
  mentions: [{ accountId: string; paginationToken?: string }, Feed]
  bookmarks: [{ accountId: string; paginationToken?: string }, Feed]
  post: [
    { accountId: string; text: string; replyTo?: string; image?: Upload },
    { id: string },
  ]
} & {
  [K in Action]: [
    { accountId: string; postId: string; active: boolean },
    { active: boolean },
  ]
}

export function bridge<K extends keyof Calls>(
  method: K,
  params?: Calls[K][0]
): Promise<Calls[K][1]> {
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const close = () => {
      window.clearTimeout(timer)
      window.removeEventListener('message', listen)
    }
    const listen = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.source !== 'supertwitter:extension' ||
        event.data.id !== id
      )
        return
      close()
      if (event.data.ok) resolve(event.data.result)
      else
        reject(
          new Error(
            typeof event.data.error === 'string'
              ? event.data.error
              : 'The connector could not complete this request.'
          )
        )
    }
    const timer = window.setTimeout(
      () => {
        close()
        reject(
          new Error(
            method === 'ping'
              ? 'Connector unavailable'
              : 'The local connector timed out. Check the extension before trying again.'
          )
        )
      },
      method === 'ping'
        ? 850
        : ['post', 'like', 'repost', 'bookmark'].includes(method)
          ? 360000
          : 30000
    )
    window.addEventListener('message', listen)
    window.postMessage(
      { source: 'supertwitter:page', id, method, params: params ?? {} },
      location.origin
    )
  })
}
