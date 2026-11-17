const el = (id) => document.getElementById(id)
let busy = false

async function rpc(method, params) {
  const reply = await chrome.runtime.sendMessage({
    channel: 'settings',
    method,
    params,
  })
  if (!reply?.ok)
    throw new Error(reply?.error || 'The local connector did not respond.')
  return reply.result
}

function status(message, failure = false) {
  el('status').textContent = message
  el('status').classList.toggle('error', failure)
}

function row(profile) {
  const li = document.createElement('li')
  const labels = document.createElement('div')
  const name = document.createElement('strong')
  const handle = document.createElement('span')
  name.textContent = profile.name
  handle.textContent = '@' + profile.username
  labels.append(name, handle)
  const remove = document.createElement('button')
  remove.className = 'secondary'
  remove.textContent = 'Remove'
  remove.setAttribute(
    'aria-label',
    'Remove @' + profile.username + ' from this browser'
  )
  remove.addEventListener('click', async () => {
    if (!confirm('Remove @' + profile.username + ' from this browser?')) return
    remove.disabled = true
    try {
      await rpc('remove', { accountId: profile.id })
      await load()
      status('Removed @' + profile.username + ' from this browser.')
    } catch (error) {
      status(error.message, true)
      remove.disabled = false
    }
  })
  li.append(labels, remove)
  return li
}

async function load() {
  const state = await rpc('load')
  el('client-id').value = state.clientId
  el('callback').value = state.redirectUri
  el('hosted').checked = state.hostedAccess
  el('local').checked = state.localAccess
  el('accounts').replaceChildren(...state.accounts.map(row))
  if (!state.accounts.length) {
    const empty = document.createElement('li')
    empty.textContent = 'No accounts connected on this device.'
    el('accounts').append(empty)
  }
}

el('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el('callback').value)
    status('Callback URL copied.')
  } catch {
    el('callback').select()
    status('Callback URL selected. Press ⌘C or Ctrl+C to copy.')
  }
})

for (const id of ['hosted', 'local']) {
  el(id).addEventListener('change', async () => {
    el('hosted').disabled = el('local').disabled = true
    try {
      await rpc('access', {
        hostedAccess: el('hosted').checked,
        localAccess: el('local').checked,
      })
      status('Site access saved.')
    } catch (error) {
      status(error.message, true)
      await load()
    } finally {
      el('hosted').disabled = el('local').disabled = false
    }
  })
}

el('connect').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (busy) return
  busy = true
  el('connect-button').disabled = true
  el('connect-button').textContent = 'Connecting…'
  status('Complete authorization in the X window.')
  try {
    const account = await rpc('connect', {
      clientId: el('client-id').value.trim(),
    })
    await load()
    status(
      'Connected @' +
        account.username +
        '. Return to SuperTwitter to switch accounts.'
    )
  } catch (error) {
    status(error.message, true)
  } finally {
    el('connect-button').disabled = false
    el('connect-button').textContent = 'Connect with X'
    busy = false
  }
})

load().catch((error) => status(error.message, true))
