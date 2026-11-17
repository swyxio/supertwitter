const el = (id) => document.getElementById(id)
const key = location.hash.slice(1)
let done = false,
  sending = false
async function rpc(method) {
  const reply = await chrome.runtime.sendMessage({
    channel: 'confirm',
    key,
    method,
  })
  if (!reply?.ok)
    throw new Error(reply?.error || 'The local connector did not respond.')
  return reply.result
}
function failed(error) {
  done = true
  el('accept').hidden = true
  el('cancel').disabled = false
  el('cancel').textContent = 'Close'
  el('status').textContent = error.message
  el('status').classList.add('error')
}
const labels = {
  like: ['Remove like', 'Like post'],
  repost: ['Undo repost', 'Repost'],
  bookmark: ['Remove bookmark', 'Bookmark post'],
}
async function load() {
  const { profile, method, params, origin } = await rpc('inspect')
  const title =
    method === 'post'
      ? params.replyTo
        ? 'Post reply'
        : 'Publish post'
      : labels[method][Number(params.active)]
  el('title').textContent = title
  el('source').textContent = 'Requested by ' + origin
  el('account').textContent = profile.name + ' · @' + profile.username
  el('text').textContent = method === 'post' ? params.text : ''
  if (params.image) {
    const image = el('image')
    image.src = params.image.dataUrl
    image.alt = params.image.alt || 'Attached image'
    image.hidden = false
    if (params.image.alt) {
      el('alt').textContent = 'Alt text · ' + params.image.alt
      el('alt').hidden = false
    }
  }
  const target = params.replyTo || params.postId
  if (target) {
    const a = el('target')
    a.href = 'https://x.com/i/status/' + target
    a.textContent =
      (params.replyTo ? 'View post you’re replying to' : 'View post on X') +
      ' ↗'
    a.hidden = false
  }
  el('accept').textContent = title
  el('accept').disabled = false
  el('review').hidden = false
}

el('accept').addEventListener('click', async (event) => {
  if (!event.isTrusted || done || sending) return
  sending = true
  el('accept').disabled = el('cancel').disabled = true
  el('status').textContent = 'Sending to X…'
  try {
    await rpc('accept')
    done = true
    el('status').textContent = 'Confirmed by X.'
    window.close()
  } catch (error) {
    failed(error)
  } finally {
    sending = false
  }
})
el('cancel').addEventListener('click', async () => {
  if (sending) return
  if (!done) await rpc('cancel').catch(() => {})
  window.close()
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !sending) el('cancel').click()
})
load().catch(failed)
