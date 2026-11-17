;(() => {
  const origins = [
    'https://x.swyx.io',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]
  if (window !== window.top || !origins.includes(location.origin)) return

  function reply(id, message) {
    window.postMessage(
      { source: 'supertwitter:extension', id, ...message },
      location.origin
    )
  }

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (
      sender.id === chrome.runtime.id &&
      message.channel === 'write-complete'
    ) {
      reply(message.id, message.response)
    }
  })

  window.addEventListener('message', async (event) => {
    const request = event.data
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      request?.source !== 'supertwitter:page' ||
      typeof request.id !== 'string' ||
      !request.id ||
      request.id.length > 128 ||
      typeof request.method !== 'string'
    )
      return
    try {
      const response = await chrome.runtime.sendMessage({
        channel: 'page',
        id: request.id,
        method: request.method,
        params: request.params,
      })
      if (!response?.pending) reply(request.id, response)
    } catch {
      reply(request.id, {
        ok: false,
        error: 'Reload this page to reconnect the local extension.',
      })
    }
  })
})()
