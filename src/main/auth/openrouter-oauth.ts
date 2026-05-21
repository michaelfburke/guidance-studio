import { createServer } from 'http'
import { createHash, randomBytes } from 'crypto'
import { shell } from 'electron'

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Runs the OpenRouter OAuth PKCE flow:
 * 1. Opens the user's browser to openrouter.ai/auth
 * 2. Listens on a temporary localhost port for the redirect callback
 * 3. Exchanges the auth code for a user-scoped OpenRouter API key
 *
 * Returns the API key on success; rejects on error or timeout.
 */
export async function openrouterOAuth(): Promise<string> {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())

  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (fn: () => void): void => {
      if (settled) return
      settled = true
      fn()
    }

    const timer = setTimeout(() => {
      server.close()
      settle(() => reject(new Error('OpenRouter authorisation timed out after 5 minutes.')))
    }, 5 * 60_000)

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }

      const code = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><head><title>Guidance Studio</title></head>' +
        '<body style="font-family:sans-serif;padding:2rem;background:#0f172a;color:#e2e8f0">' +
        '<h2>Connected to OpenRouter</h2>' +
        '<p>You can close this tab and return to Guidance Studio.</p>' +
        '<script>window.close()</script></body></html>'
      )
      server.close()
      clearTimeout(timer)

      if (!code) {
        settle(() => reject(new Error('OpenRouter did not return an authorisation code.')))
        return
      }

      fetch('https://openrouter.ai/api/v1/auth/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: verifier })
      })
        .then(r => {
          if (!r.ok) throw new Error(`OpenRouter key exchange failed (${r.status})`)
          return r.json() as Promise<{ key?: string }>
        })
        .then(data => {
          if (!data.key) throw new Error('OpenRouter did not return an API key.')
          settle(() => resolve(data.key!))
        })
        .catch(err => settle(() => reject(err)))
    })

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      const authUrl = new URL('https://openrouter.ai/auth')
      authUrl.searchParams.set('callback_url', `http://127.0.0.1:${port}/callback`)
      authUrl.searchParams.set('code_challenge', challenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      shell.openExternal(authUrl.toString())
    })

    server.on('error', err => {
      clearTimeout(timer)
      settle(() => reject(err))
    })
  })
}
