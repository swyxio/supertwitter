import {
  callbackCode,
  checkedId,
  exchange,
  feed,
  lookup,
  oauthRequest,
  whoami,
  write,
  writeMethods,
  writeParams,
  XError,
} from './api.mjs'

const hosted = 'https://x.swyx.io'
const local = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])
const redirectUri = chrome.identity.getRedirectURL('x')
const protectedStorage = chrome.storage.local.setAccessLevel({
  accessLevel: 'TRUSTED_CONTEXTS',
})
const accountKey = (id) => 'account:' + checkedId(id)
const prefs = async () =>
  chrome.storage.local.get({
    clientId: '',
    hostedAccess: true,
    localAccess: false,
  })
const withLock = (key, fn) => navigator.locks.request(key, fn)
const lifetime = 5 * 60 * 1000

async function profiles() {
  const all = await chrome.storage.local.get(null)
  return Object.entries(all)
    .filter(([key]) => key.startsWith('account:'))
    .map(([, record]) => record.profile)
    .sort((a, b) => a.username.localeCompare(b.username))
}

async function recordFor(id) {
  const key = accountKey(id)
  const record = (await chrome.storage.local.get(key))[key]
  if (!record)
    throw new Error('Connect this account in the local extension first.')
  return record
}

async function tokenFor(id, rejectedToken) {
  return withLock(accountKey(id), async () => {
    const record = await recordFor(id)
    if (
      record.expiresAt > Date.now() + 60000 &&
      record.accessToken !== rejectedToken
    )
      return record.accessToken
    if (!record.refreshToken)
      throw new Error('Reconnect this account in the local extension.')
    const token = await exchange({
      client_id: record.clientId,
      grant_type: 'refresh_token',
      refresh_token: record.refreshToken,
    })
    await chrome.storage.local.set({
      [accountKey(id)]: {
        ...record,
        ...token,
        refreshToken: token.refreshToken ?? record.refreshToken,
      },
    })
    return token.accessToken
  })
}

async function connect(clientId) {
  if (
    typeof clientId !== 'string' ||
    !/^[A-Za-z0-9._~-]{1,256}$/.test(clientId)
  )
    throw new Error('Enter your X OAuth 2.0 public client ID.')
  const { verifier, state, url } = await oauthRequest(clientId, redirectUri)
  let callback
  try {
    callback = await chrome.identity.launchWebAuthFlow({
      url,
      interactive: true,
    })
  } catch {
    throw new Error(
      'Authorization closed. Verify the callback in your X app settings, then connect again.'
    )
  }
  const code = callbackCode(callback, redirectUri, state)
  const token = await exchange({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier,
  })
  const profile = await whoami(token.accessToken)
  await withLock(accountKey(profile.id), () =>
    chrome.storage.local.set({
      clientId,
      [accountKey(profile.id)]: { clientId, profile, ...token },
    })
  )
  return profile
}

function pageOrigin(sender) {
  if (
    sender.id !== chrome.runtime.id ||
    !sender.tab ||
    sender.frameId !== 0 ||
    !sender.documentId
  )
    throw new Error('Unrecognized client.')
  const origin = new URL(sender.url).origin
  if (sender.origin !== origin || (origin !== hosted && !local.has(origin)))
    throw new Error('Unrecognized client.')
  return origin
}

async function checkAccess(origin) {
  const settings = await prefs()
  if (origin === hosted ? !settings.hostedAccess : !settings.localAccess) {
    throw new Error('Allow this site under Site access in the local extension.')
  }
}

async function getPosts(method, { accountId, paginationToken, postId }) {
  const get = (token) =>
    method === 'lookup'
      ? lookup(token, postId)
      : feed(token, accountId, method, paginationToken)
  const first = await tokenFor(accountId)
  let result
  try {
    result = await get(first)
  } catch (error) {
    if (!(error instanceof XError) || error.status !== 401) throw error
    result = await get(await tokenFor(accountId, first))
  }
  const key = 'actions:' + checkedId(accountId)
  const saved = (await chrome.storage.local.get(key))[key] ?? {}
  const withFlags = (post) => ({ ...saved[post.id], ...post })
  return method === 'lookup'
    ? withFlags(result)
    : { ...result, posts: result.posts.map(withFlags) }
}

async function saveAction(method, params) {
  const key = 'actions:' + checkedId(params.accountId)
  const field = { like: 'liked', repost: 'reposted', bookmark: 'bookmarked' }[
    method
  ]
  await withLock(accountKey(params.accountId), async () => {
    // Removing an account also removes its local activity.
    await recordFor(params.accountId)
    const saved = (await chrome.storage.local.get(key))[key] ?? {}
    const flags = { ...saved[params.postId], [field]: params.active }
    delete saved[params.postId]
    const recent = Object.entries(saved).slice(-399)
    await chrome.storage.local.set({
      [key]: { ...Object.fromEntries(recent), [params.postId]: flags },
    })
  })
}

// The request and target document survive service-worker suspension. Only the
// extension's own confirmation tab can accept a specific pending write.
async function currentIntent() {
  return (await chrome.storage.session.get('intent')).intent
}

async function notifyCaller(intent, response) {
  try {
    await chrome.tabs.sendMessage(
      intent.caller,
      { channel: 'write-complete', id: intent.requestId, response },
      { documentId: intent.documentId }
    )
  } catch {
    /* User closed or navigated the originating page. */
  }
}

async function askForWrite(method, rawParams, requestId, sender, origin) {
  const params = writeParams(method, rawParams)
  const { profile } = await recordFor(params.accountId)
  return withLock('confirmation', async () => {
    const previous = await currentIntent()
    if (previous && previous.created + lifetime > Date.now())
      throw new Error('Finish the open extension confirmation first.')
    if (previous)
      await notifyCaller(previous, {
        ok: false,
        error: 'Confirmation expired. Check X before trying again.',
      })
    const key = crypto.randomUUID()
    const intent = {
      key,
      method,
      params,
      profile,
      requestId,
      origin,
      caller: sender.tab.id,
      documentId: sender.documentId,
      created: Date.now(),
      phase: 'review',
    }
    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL('confirm.html') + '#' + key,
      openerTabId: sender.tab.id,
    })
    await chrome.storage.session.set({
      intent: { ...intent, reviewer: tab.id },
    })
    return { pending: true }
  })
}

async function checkedIntent(key, sender) {
  const intent = await currentIntent()
  if (!intent || intent.key !== key || intent.reviewer !== sender.tab?.id)
    throw new Error('This request is no longer pending.')
  return intent
}

async function respondToWrite(key, sender, accepted) {
  const intent = await withLock('confirmation', async () => {
    const pending = await checkedIntent(key, sender)
    if (pending.phase !== 'review')
      throw new Error('This action has already been submitted.')
    if (!accepted || Date.now() > pending.created + lifetime) {
      await chrome.storage.session.remove('intent')
      await notifyCaller(pending, {
        ok: false,
        error: accepted ? 'Confirmation expired.' : 'Action canceled.',
      })
      if (accepted) throw new Error('Confirmation expired.')
      return null
    }
    await chrome.storage.session.set({
      intent: { ...pending, phase: 'sending' },
    })
    return pending
  })
  if (!intent) return
  let result, failure
  try {
    await checkAccess(intent.origin)
    const token = await tokenFor(intent.params.accountId)
    result = await write(token, intent.method, intent.params)
    if (intent.method !== 'post')
      await saveAction(intent.method, intent.params).catch(() => {})
  } catch (error) {
    failure = error
  }
  await withLock('confirmation', async () => {
    if ((await currentIntent())?.key === key)
      await chrome.storage.session.remove('intent')
    await notifyCaller(
      intent,
      failure ? { ok: false, error: failure.message } : { ok: true, result }
    )
  })
  if (failure) throw failure
  return result
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void withLock('confirmation', async () => {
    const intent = await currentIntent()
    if (
      !intent ||
      intent.phase !== 'review' ||
      (tabId !== intent.reviewer && tabId !== intent.caller)
    )
      return
    await chrome.storage.session.remove('intent')
    if (tabId === intent.reviewer)
      await notifyCaller(intent, { ok: false, error: 'Action canceled.' })
    else await chrome.tabs.remove(intent.reviewer).catch(() => {})
  })
})

async function dispatch(request, sender) {
  await protectedStorage
  if (!request || sender.id !== chrome.runtime.id)
    throw new Error('Unrecognized request.')
  const { channel, method, params = {} } = request
  if (channel === 'page') {
    const origin = pageOrigin(sender)
    if (method === 'ping')
      return { version: chrome.runtime.getManifest().version }
    if (method === 'manage') {
      await chrome.runtime.openOptionsPage()
      return {}
    }
    await checkAccess(origin)
    if (method === 'accounts') return profiles()
    if (
      ['timeline', 'bookmarks', 'profile', 'mentions', 'lookup'].includes(
        method
      )
    )
      return getPosts(method, params)
    if (
      writeMethods.has(method) &&
      typeof request.id === 'string' &&
      request.id.length <= 128
    ) {
      return askForWrite(method, params, request.id, sender, origin)
    }
  }
  if (
    channel === 'settings' &&
    sender.url === chrome.runtime.getURL('options.html')
  ) {
    if (method === 'load')
      return { ...(await prefs()), accounts: await profiles(), redirectUri }
    if (method === 'connect') return connect(params.clientId)
    if (
      method === 'access' &&
      typeof params.hostedAccess === 'boolean' &&
      typeof params.localAccess === 'boolean'
    ) {
      await chrome.storage.local.set({
        hostedAccess: params.hostedAccess,
        localAccess: params.localAccess,
      })
      return {}
    }
    if (method === 'remove') {
      await withLock(accountKey(params.accountId), () =>
        chrome.storage.local.remove([
          accountKey(params.accountId),
          'actions:' + params.accountId,
        ])
      )
      return {}
    }
  }
  if (
    channel === 'confirm' &&
    sender.url.split('#')[0] === chrome.runtime.getURL('confirm.html')
  ) {
    if (method === 'inspect') {
      return withLock('confirmation', async () => {
        const { profile, method, params, origin, phase, created } =
          await checkedIntent(request.key, sender)
        if (phase !== 'review' || Date.now() > created + lifetime)
          throw new Error(
            'This confirmation has expired or has already been submitted.'
          )
        return { profile, method, params, origin }
      })
    }
    if (method === 'accept' || method === 'cancel')
      return respondToWrite(request.key, sender, method === 'accept')
  }
  throw new Error('Unsupported connector request.')
}

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  dispatch(request, sender).then(
    (result) =>
      respond(result?.pending ? { pending: true } : { ok: true, result }),
    (error) =>
      respond({
        ok: false,
        error: error.message || 'The connector could not complete the request.',
      })
  )
  return true
})
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage())
