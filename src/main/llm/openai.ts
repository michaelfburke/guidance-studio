import type { LLMProvider, LLMCallOptions } from './provider'
import { imageMimeType } from '../asset-manager'

export interface OpenAIProviderConfig {
  /** Optional — some endpoints (e.g. a local Copilot proxy) need no key. */
  apiKey: string
  /** Base URL up to and including the API version, e.g. http://localhost:4141/v1 */
  baseURL: string
  model: string
}

interface ChatContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatContentPart[]
}

/**
 * Generic provider for any OpenAI-compatible chat-completions endpoint:
 * a local GitHub Copilot proxy (copilot-api), OpenRouter, OpenAI, Ollama, etc.
 * Only the base URL, model, and (optional) key differ.
 */
export class OpenAIProvider implements LLMProvider {
  name = 'openai'
  private apiKey: string
  private baseURL: string
  private model: string

  constructor(config: OpenAIProviderConfig) {
    this.apiKey = config.apiKey
    this.baseURL = config.baseURL.replace(/\/+$/, '')
    this.model = config.model
  }

  async call(options: LLMCallOptions): Promise<string> {
    const { prompt, images, maxTokens = 4096, systemPrompt } = options

    const content: ChatContentPart[] = []
    if (images && images.length > 0) {
      for (const img of images) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${imageMimeType(img)};base64,${img.toString('base64')}` }
        })
      }
    }
    content.push({ type: 'text', text: prompt })

    const messages: ChatMessage[] = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content })

    // Bound the request so a stalled provider cannot hang the whole run.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    let res: Response
    try {
      res = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Copilot proxies ignore this; OpenAI/OpenRouter require a real key.
          Authorization: `Bearer ${this.apiKey || 'copilot'}`
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          stream: false,
          messages
        }),
        signal: controller.signal
      })
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(
          `The OpenAI-compatible endpoint at ${this.baseURL} did not respond within 120s. ` +
          'The request may be too large, or the proxy/model may be overloaded.'
        )
      }
      throw new Error(
        `Could not reach the OpenAI-compatible endpoint at ${this.baseURL} ` +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        'If you are using GitHub Copilot, make sure the copilot-api proxy is running.'
      )
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`OpenAI-compatible API error ${res.status}: ${detail.slice(0, 400)}`)
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const out = data.choices?.[0]?.message?.content
    if (typeof out !== 'string' || out.length === 0) {
      throw new Error('OpenAI-compatible API returned an empty response')
    }
    return out
  }
}
