import type { LLMProvider, LLMCallOptions } from './provider'
import { imageMimeType } from '../asset-manager'

interface CachedToken {
  value: string
  expiresAt: number
}

/**
 * Calls the GitHub Copilot chat completions API on behalf of a user who has
 * authorised Guidance Studio via GitHub Device Flow.
 *
 * The GitHub OAuth token is long-lived; the Copilot session token it issues is
 * short-lived (~30 min) and is refreshed transparently.
 */
export class CopilotProvider implements LLMProvider {
  name = 'copilot'
  private githubToken: string
  private model: string
  private sessionToken: CachedToken | null = null

  constructor(githubToken: string, model = 'gpt-4o') {
    this.githubToken = githubToken
    this.model = model
  }

  private async getSessionToken(): Promise<string> {
    if (this.sessionToken && Date.now() < this.sessionToken.expiresAt - 60_000) {
      return this.sessionToken.value
    }

    const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        Authorization: `Bearer ${this.githubToken}`,
        Accept: 'application/json'
      }
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `Could not obtain a Copilot session token (${res.status}). ` +
        'Make sure your GitHub account has an active Copilot subscription. ' +
        `Detail: ${text.slice(0, 200)}`
      )
    }

    const data = await res.json() as { token: string; expires_at: string }
    this.sessionToken = {
      value: data.token,
      expiresAt: new Date(data.expires_at).getTime()
    }
    return data.token
  }

  async call(options: LLMCallOptions): Promise<string> {
    const { prompt, images, maxTokens = 4096, systemPrompt } = options
    const token = await this.getSessionToken()

    type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
    const content: Part[] = []
    if (images?.length) {
      for (const img of images) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${imageMimeType(img)};base64,${img.toString('base64')}` }
        })
      }
    }
    content.push({ type: 'text', text: prompt })

    const messages: Array<{ role: string; content: string | Part[] }> = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)

    let res: Response
    try {
      res = await fetch('https://api.githubcopilot.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Copilot-Integration-Id': 'vscode-chat',
          'Editor-Version': 'vscode/1.95.0'
        },
        body: JSON.stringify({ model: this.model, messages, max_tokens: maxTokens, stream: false }),
        signal: controller.signal
      })
    } catch (err) {
      if (controller.signal.aborted) throw new Error('GitHub Copilot did not respond within 120 s.')
      throw err
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`GitHub Copilot API error ${res.status}: ${text.slice(0, 400)}`)
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const out = data.choices?.[0]?.message?.content
    if (typeof out !== 'string' || out.length === 0) {
      throw new Error('GitHub Copilot returned an empty response.')
    }
    return out
  }
}
