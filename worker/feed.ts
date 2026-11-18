import { load } from 'cheerio/slim'
import type { Account, Post } from '../src/model'

export interface Snapshot {
  posts: Post[]
  updatedAt: string
}

// Only messages constructed locally by this type are safe to log.
export class FeedFailure extends Error {}

const maxSourceBytes = 1024 * 1024
const maxPosts = 40
const handlePattern = '[a-zA-Z0-9_]{1,15}'
const statusPath = new RegExp(
  '^/(' + handlePattern + ')/status/([0-9]{1,20})/?$'
)
const repostLabel = new RegExp('^@(' + handlePattern + ') reposted$', 'i')

function statusRef(href: string | undefined, source: URL) {
  if (!href) return null
  try {
    const url = new URL(href, source)
    if (
      url.origin !== source.origin &&
      url.origin !== 'https://x.com' &&
      url.origin !== 'https://twitter.com'
    )
      return null
    return statusPath.exec(url.pathname)
  } catch {
    return null
  }
}

function imageUrl(input: string | undefined) {
  if (!input) return undefined
  try {
    const url = new URL(input)
    if (url.origin !== 'https://pbs.twimg.com' || url.username || url.password)
      return undefined
    if (
      !/^\/(?:media|profile_images|default_profile_images|amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\/[a-z\d_./%-]+$/i.test(
        url.pathname
      )
    )
      return undefined
    const safe = new URL(url.pathname, url.origin)
    for (const key of ['format', 'name']) {
      const value = url.searchParams.get(key)
      if (value && /^[a-z0-9_]{1,12}$/i.test(value))
        safe.searchParams.set(key, value)
    }
    return safe.href
  } catch {
    return undefined
  }
}

export function normalizeList(html: string, source: URL): Post[] {
  const $ = load(html)
  $('script,style,template').remove()
  const timeline = $('.timeline').first()
  const rows = timeline.find('.timeline-item')
  if (
    !timeline.length ||
    (!rows.length && !timeline.find('.timeline-none').length)
  ) {
    throw new FeedFailure('List markup unavailable')
  }
  const hiddenHost = new RegExp(
    source.hostname.replace(/[.*+?^${\}()|[\]\\]/g, '\\$&'),
    'gi'
  )
  const clean = (value: string, limit: number) =>
    value.replace(hiddenHost, 'x.com').trim().slice(0, limit)
  const makeAuthor = (username: string, label?: string): Account => ({
    id: 'x-handle:' + username.toLowerCase(),
    username,
    name: clean(label || username, 100) || username,
  })
  const seen = new Set<string>()
  const posts: Post[] = []
  rows.each((_, row) => {
    if (posts.length >= maxPosts) return false
    const body = $(row).children('.tweet-body').first()
    const reference = statusRef(
      body.children('a.tweet-link').attr('href'),
      source
    )
    if (!reference || seen.has(reference[2])) return
    const [, username, id] = reference
    const header = body.children('.tweet-header')
    const date = Date.parse(header.find('.tweet-date a').attr('title') || '')
    if (!Number.isFinite(date)) return
    const author = makeAuthor(username, header.find('a.fullname').text())
    const avatar = imageUrl(header.find('.tweet-avatar img').attr('src'))
    if (avatar) author.avatar = avatar
    const content = body.children('.tweet-content').first()
    content.find('br').replaceWith('\n')
    const text = clean(content.text(), 25000)
    const stat = (icon: string) => {
      const raw = body
        .children('.tweet-stats')
        .find('.icon-' + icon)
        .first()
        .closest('.tweet-stat')
        .text()
        .trim()
        .replaceAll(',', '')
      const m = /^(\d+(?:\.\d+)?)\s*([KM]?)$/i.exec(raw)
      return m
        ? Math.round(
            Number(m[1]) * ({ K: 1000, M: 1000000 }[m[2].toUpperCase()] ?? 1)
          )
        : 0
    }
    const post: Post = {
      id,
      author,
      createdAt: new Date(date).toISOString(),
      text,
      metrics: {
        replies: stat('comment'),
        reposts: stat('retweet'),
        likes: stat('heart'),
      },
    }
    const by = repostLabel.exec(body.children('.retweet-header').text().trim())
    if (by) post.repostedBy = by[1]
    const media: NonNullable<Post['media']> = []
    body
      .children('.attachments')
      .find('img,video[poster]')
      .each((_, el) => {
        const node = $(el)
        const video = node.is('video')
        const url = imageUrl(node.attr(video ? 'poster' : 'src'))
        if (url && media.length < 4 && !media.some((m) => m.url === url)) {
          media.push({
            url,
            alt: clean(node.attr('alt') || '', 1000),
            type: video ? 'video' : 'photo',
          })
        }
      })
    if (media.length) post.media = media
    const quote = body.children('.quote').first()
    const quoted = statusRef(quote.find('a.quote-link').attr('href'), source)
    if (quoted)
      post.quote = {
        author: makeAuthor(quoted[1]),
        text: clean(quote.find('.quote-text').text(), 25000),
      }
    if (!text && !post.media && !post.quote) return
    seen.add(id)
    posts.push(post)
  })
  if (rows.length && !posts.length)
    throw new FeedFailure('No readable list entries')
  return posts
}

async function boundedHtml(response: Response) {
  if (
    !response.ok ||
    !response.headers
      .get('content-type')
      ?.toLowerCase()
      .includes('text/html') ||
    !response.body
  ) {
    await response.body?.cancel()
    throw new FeedFailure(
      'List source unavailable (HTTP ' + response.status + ')'
    )
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > maxSourceBytes) {
        await reader.cancel()
        throw new FeedFailure('List page too large')
      }
      text += decoder.decode(part.value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

export async function readSource(configuredUrl: string): Promise<Snapshot> {
  const source = new URL(configuredUrl)
  if (
    source.protocol !== 'https:' ||
    source.username ||
    source.password ||
    source.search ||
    source.hash ||
    !/^\/i\/lists\/\d{1,20}\/?$/.test(source.pathname)
  ) {
    throw new FeedFailure('Invalid list configuration')
  }
  const response = await fetch(source.href, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      Accept: 'text/html',
      'User-Agent': 'SuperTwitter feed reader/1.0',
    },
    signal: AbortSignal.timeout(18000),
  }).catch(() => {
    throw new FeedFailure('List request failed')
  })
  const posts = normalizeList(await boundedHtml(response), source)
  return { posts, updatedAt: new Date().toISOString() }
}
