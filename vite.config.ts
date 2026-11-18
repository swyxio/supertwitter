import { defineConfig, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const feedPath = '/api/high-signal'

// Local UI development reads the same public snapshot as the hosted app.
const publicList: Plugin = {
  name: 'public-list-in-development',
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (request.url?.split('?')[0] !== feedPath) return next()
      if (
        request.url !== feedPath ||
        !['GET', 'HEAD'].includes(request.method || '')
      ) {
        response.statusCode = request.url === feedPath ? 405 : 400
        response.end()
        return
      }
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      try {
        const upstream = await fetch(new URL(feedPath, 'https://x.swyx.io'), {
          method: request.method,
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
        })
        if (
          !upstream.ok ||
          !upstream.headers.get('content-type')?.includes('application/json')
        )
          throw new Error('Feed unavailable')
        response.end(await upstream.text())
      } catch {
        response.statusCode = 503
        response.end(JSON.stringify({ error: 'Feed temporarily unavailable' }))
      }
    })
  },
}

export default defineConfig({
  plugins: [tailwindcss(), publicList],
  build: { target: 'es2022' },
})
