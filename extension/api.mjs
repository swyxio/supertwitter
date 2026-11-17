// Public OAuth client, with all provider requests restricted to the documented API.
export const apiOrigin = 'https://api.x.com'
const scopes =
  'tweet.read users.read tweet.write like.write bookmark.read bookmark.write media.write offline.access'
const mediaHosts = new Set([
  'pbs.twimg.com',
  'video.twimg.com',
  'abs.twimg.com',
])
const idPattern = /^\d{1,20}$/

export function checkedId(value) {
  if (typeof value !== 'string' || !idPattern.test(value))
    throw new Error('Invalid X account or post ID.')
  return value
}

function checkedMedia(value) {
  if (typeof value !== 'string') return
  try {
    const url = new URL(value)
    if (
      url.protocol === 'https:' &&
      mediaHosts.has(url.host) &&
      !url.username &&
      !url.password
    )
      return url.href
  } catch {
    /* An invalid image can be omitted without losing the post. */
  }
}

export function accountProfile(user) {
  if (!user || !idPattern.test(user.id) || !user.username || !user.name) {
    throw new Error('X did not return a complete account profile.')
  }
  return {
    id: checkedId(user.id),
    name: user.name,
    username: user.username,
    avatar: checkedMedia(user.profile_image_url),
    verified: user.verified === true,
  }
}

export function readPosts(page, bookmarked = false) {
  if (!Array.isArray(page.data) && page.errors?.length)
    throw new Error('X could not load this feed.')
  const users = new Map(
    (page.includes?.users ?? []).map((user) => [user.id, user])
  )
  const media = new Map(
    (page.includes?.media ?? []).map((item) => [item.media_key, item])
  )
  const posts = (page.data ?? []).map((post) => {
    const author = users.get(post.author_id)
    const counts = post.public_metrics ?? {}
    const attachments = (post.attachments?.media_keys ?? []).flatMap((key) => {
      const item = media.get(key)
      const url = checkedMedia(item?.url ?? item?.preview_image_url)
      return url ? [{ url, alt: item.alt_text ?? '', type: item.type }] : []
    })
    return {
      id: checkedId(post.id),
      text: post.note_post?.text ?? post.text ?? '',
      createdAt: post.created_at ?? '',
      author: author
        ? accountProfile(author)
        : {
            id: post.author_id ?? '',
            name: 'X account',
            username: post.username ?? '',
          },
      metrics: {
        replies: counts.reply_count ?? 0,
        reposts: counts.repost_count ?? counts.retweet_count ?? 0,
        likes: counts.like_count ?? 0,
        views: counts.impression_count,
      },
      media: attachments,
      ...(bookmarked ? { bookmarked: true } : {}),
    }
  })
  return { posts, nextToken: page.meta?.next_token }
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

export async function oauthRequest(clientId, redirectUri) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)))
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  )
  const url = new URL('https://x.com/i/oauth2/authorize')
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    code_challenge: base64url(new Uint8Array(digest)),
    code_challenge_method: 'S256',
  })
  return { verifier, state, url: url.href }
}

export function callbackCode(value, redirectUri, state) {
  if (!value) throw new Error('Connection canceled.')
  const url = new URL(value)
  const target = new URL(redirectUri)
  if (
    url.origin !== target.origin ||
    url.pathname !== target.pathname ||
    url.searchParams.get('state') !== state
  ) {
    throw new Error(
      'The authorization response could not be verified. Connect again.'
    )
  }
  if (url.searchParams.has('error'))
    throw new Error('X authorization was declined.')
  const code = url.searchParams.get('code')
  if (!code) throw new Error('X did not return an authorization code.')
  return code
}

export class XError extends Error {
  constructor(status, detail) {
    super(detail)
    this.status = status
  }
}

async function apiRequest(path, init, kind = 'api') {
  let response
  try {
    response = await fetch(apiOrigin + path, {
      ...init,
      signal: AbortSignal.timeout(25000),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
  } catch {
    const message =
      init.method && init.method !== 'GET' && kind === 'api'
        ? 'The connection ended before X confirmed the action. Check X before trying again.'
        : 'Could not reach X. Check your connection and try again.'
    throw new Error(message)
  }
  if (!response.ok) {
    const errors = {
      401: 'X authorization has expired. Reconnect this account in the extension.',
      402: 'This X API app needs credits. Check its billing in the X Developer Console.',
      403: 'X denied access. Check this app’s X API access, permissions and account restrictions.',
      404: 'X could not find this post or account.',
      429: 'X has rate-limited this app. Try again later.',
    }
    const message =
      kind === 'token' && (response.status === 400 || response.status === 401)
        ? 'X rejected the authorization. Check your public client ID and registered callback, then reconnect.'
        : (errors[response.status] ??
          `X rejected this request (HTTP ${response.status}).`)
    throw new XError(response.status, message)
  }
  return response.json()
}

export async function exchange(params) {
  const result = await apiRequest(
    '/2/oauth2/token',
    { method: 'POST', body: new URLSearchParams(params) },
    'token'
  )
  if (
    typeof result.access_token !== 'string' ||
    !result.access_token ||
    result.token_type?.toLowerCase() !== 'bearer'
  ) {
    throw new Error('X returned an incomplete authorization.')
  }
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: Date.now() + (Number(result.expires_in) || 7200) * 1000,
  }
}

function request(token, path, method = 'GET', data) {
  const headers = { Authorization: `Bearer ${token}` }
  if (data !== undefined) headers['Content-Type'] = 'application/json'
  return apiRequest(path, {
    method,
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  })
}

export async function whoami(token) {
  return accountProfile(
    (await request(token, '/2/users/me?user.fields=profile_image_url,verified'))
      .data
  )
}

function postFields() {
  return new URLSearchParams({
    'post.fields': 'created_at,attachments,public_metrics,note_post',
    expansions: 'author_id,attachments.media_keys',
    'user.fields': 'profile_image_url,verified',
    'media.fields': 'url,preview_image_url,type,alt_text',
  })
}

export async function lookup(token, id) {
  const doc = await request(token, `/2/tweets/${checkedId(id)}?${postFields()}`)
  if (!doc.data) throw new Error('X could not find this post.')
  return readPosts({ data: [doc.data], includes: doc.includes }).posts[0]
}

export async function feed(token, accountId, method, pagination) {
  const query = postFields()
  query.set('max_results', '25')
  if (pagination !== undefined) {
    if (
      typeof pagination !== 'string' ||
      !pagination ||
      pagination.length > 2048
    )
      throw new Error('Invalid page token.')
    query.set('pagination_token', pagination)
  }
  const resource = {
    timeline: 'timelines/reverse_chronological',
    bookmarks: 'bookmarks',
    mentions: 'mentions',
    profile: 'tweets',
  }[method]
  return readPosts(
    await request(
      token,
      `/2/users/${checkedId(accountId)}/${resource}?${query}`
    ),
    method === 'bookmarks'
  )
}

const actions = {
  like: ['likes', 'liked'],
  repost: ['retweets', 'retweeted'],
  bookmark: ['bookmarks', 'bookmarked'],
}
export const writeMethods = new Set(['post', ...Object.keys(actions)])

function checkedImage(image) {
  if (
    !image ||
    typeof image.dataUrl !== 'string' ||
    image.dataUrl.length > 2796240
  )
    throw new Error('Choose an image up to 2 MiB.')
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(
    image.dataUrl
  )
  if (!match || match[2].length % 4 !== 0)
    throw new Error('Choose a PNG, JPEG or WebP image.')
  let bytes
  try {
    bytes = atob(match[2])
  } catch {
    throw new Error('Invalid image encoding.')
  }
  const matches = {
    png: bytes.startsWith('\x89PNG\r\n\x1a\n'),
    jpeg: bytes.startsWith('\xff\xd8\xff'),
    webp: bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP',
  }
  if (!matches[match[1]] || bytes.length > 2 * 1024 * 1024)
    throw new Error('Choose a valid image up to 2 MiB.')
  const alt = image.alt ?? ''
  if (typeof alt !== 'string' || [...alt].length > 1000)
    throw new Error('Use up to 1,000 characters of alt text.')
  return { dataUrl: image.dataUrl, alt }
}

export function writeParams(method, params) {
  const accountId = checkedId(params?.accountId)
  if (method === 'post') {
    const image = params.image == null ? undefined : checkedImage(params.image)
    if (
      typeof params.text !== 'string' ||
      (!params.text.trim() && !image) ||
      params.text.length > 100000
    ) {
      throw new Error('Enter text for your post.')
    }
    return {
      accountId,
      text: params.text,
      ...(image ? { image } : {}),
      ...(params.replyTo ? { replyTo: checkedId(params.replyTo) } : {}),
    }
  }
  if (!Object.hasOwn(actions, method) || typeof params.active !== 'boolean')
    throw new Error('Invalid action.')
  return { accountId, postId: checkedId(params.postId), active: params.active }
}

async function uploadImage(token, image) {
  const media = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)
  const result = await request(token, '/2/media/upload', 'POST', {
    media,
    media_category: 'tweet_image',
  })
  const id = checkedId(result.data?.id)
  let status = result.data.processing_info
  const deadline = Date.now() + 60000
  while (status && status.state !== 'succeeded') {
    const delay = Math.max(1, Number(status.check_after_secs) || 1) * 1000
    if (status.state === 'failed' || Date.now() + delay > deadline)
      throw new Error(
        'X could not finish processing this image. Your post has not been submitted.'
      )
    await new Promise((resolve) => setTimeout(resolve, delay))
    status = (
      await request(token, '/2/media/upload?command=STATUS&media_id=' + id)
    ).data?.processing_info
  }
  if (image.alt) {
    const tagged = await request(token, '/2/media/metadata', 'POST', {
      id,
      metadata: { alt_text: { text: image.alt } },
    })
    if (tagged.data?.id !== id)
      throw new Error(
        'X did not confirm the alt text. Your post has not been submitted.'
      )
  }
  return id
}

export async function write(token, method, params) {
  if (method === 'post') {
    const body = params.text.trim() ? { text: params.text } : {}
    if (params.image)
      body.media = { media_ids: [await uploadImage(token, params.image)] }
    if (params.replyTo) body.reply = { in_reply_to_tweet_id: params.replyTo }
    const result = await request(token, '/2/tweets', 'POST', body)
    return { id: checkedId(result.data?.id) }
  }
  const [resource, field] = actions[method]
  const path = `/2/users/${params.accountId}/${resource}`
  const result = params.active
    ? await request(token, path, 'POST', { tweet_id: params.postId })
    : await request(token, `${path}/${params.postId}`, 'DELETE')
  if (result.data?.[field] !== params.active)
    throw new Error('X did not confirm the requested change.')
  return { active: result.data[field] }
}
