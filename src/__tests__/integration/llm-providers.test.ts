import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Claude ──────────────────────────────────────────────────────────────────

const { mockMessagesCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}))

// ── Gemini ───────────────────────────────────────────────────────────────────

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}))

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}))

import { ClaudeProvider } from '../../main/llm/claude'
import { GeminiProvider } from '../../main/llm/gemini'
import { OpenAIProvider } from '../../main/llm/openai'
import { CopilotProvider } from '../../main/llm/copilot'

const BASE_OPTS = { prompt: 'What is 2+2?' }

// ── Claude tests ─────────────────────────────────────────────────────────────

describe('ClaudeProvider', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset()
  })

  it('returns text from a successful response', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'The answer is 4.' }],
    })
    const provider = new ClaudeProvider('sk-test')
    const result = await provider.call(BASE_OPTS)
    expect(result).toBe('The answer is 4.')
  })

  it('sends images as base64 content blocks when provided', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    })
    const provider = new ClaudeProvider('sk-test')
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47]) // PNG magic bytes
    await provider.call({ ...BASE_OPTS, images: [pngBuf] })

    const call = mockMessagesCreate.mock.calls[0][0]
    const imageBlock = call.messages[0].content[0]
    expect(imageBlock.type).toBe('image')
    expect(imageBlock.source.media_type).toBe('image/png')
    expect(imageBlock.source.data).toBe(pngBuf.toString('base64'))
  })

  it('passes systemPrompt to messages.create', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'response' }],
    })
    const provider = new ClaudeProvider('sk-test')
    await provider.call({ ...BASE_OPTS, systemPrompt: 'Be concise.' })

    const call = mockMessagesCreate.mock.calls[0][0]
    expect(call.system).toBe('Be concise.')
  })

  it('throws when response contains no text block', async () => {
    mockMessagesCreate.mockResolvedValue({ content: [] })
    const provider = new ClaudeProvider('sk-test')
    await expect(provider.call(BASE_OPTS)).rejects.toThrow('No text response from Claude')
  })
})

// ── Gemini tests ──────────────────────────────────────────────────────────────

describe('GeminiProvider', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset()
  })

  it('returns text from a successful response', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'Gemini says 4.' },
    })
    const provider = new GeminiProvider('gemini-key')
    const result = await provider.call(BASE_OPTS)
    expect(result).toBe('Gemini says 4.')
  })

  it('sends images as inlineData parts', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'ok' },
    })
    const provider = new GeminiProvider('gemini-key')
    const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]) // JPEG magic bytes
    await provider.call({ ...BASE_OPTS, images: [jpegBuf] })

    const call = mockGenerateContent.mock.calls[0][0]
    const imagePart = call.contents[0].parts[0]
    expect(imagePart.inlineData.mimeType).toBe('image/jpeg')
    expect(imagePart.inlineData.data).toBe(jpegBuf.toString('base64'))
  })
})

// ── OpenAIProvider tests ──────────────────────────────────────────────────────

describe('OpenAIProvider', () => {
  const config = { apiKey: 'key-123', baseURL: 'http://localhost:4141/v1', model: 'gpt-4o' }
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  it('returns text from a successful response', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ choices: [{ message: { content: 'OpenAI says 4.' } }] }),
    })
    const provider = new OpenAIProvider(config)
    const result = await provider.call(BASE_OPTS)
    expect(result).toBe('OpenAI says 4.')
  })

  it('posts to the configured baseURL', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
    })
    const provider = new OpenAIProvider(config)
    await provider.call(BASE_OPTS)
    const url = fetchSpy.mock.calls[0][0]
    expect(url).toBe('http://localhost:4141/v1/chat/completions')
  })

  it('sends Authorization: Bearer header', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
    })
    const provider = new OpenAIProvider(config)
    await provider.call(BASE_OPTS)
    const headers = fetchSpy.mock.calls[0][1].headers
    expect(headers.Authorization).toBe('Bearer key-123')
  })

  it('throws on non-2xx HTTP response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    })
    const provider = new OpenAIProvider(config)
    await expect(provider.call(BASE_OPTS)).rejects.toThrow('401')
  })

  it('throws when choices[0].message.content is empty', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '' } }] }),
    })
    const provider = new OpenAIProvider(config)
    await expect(provider.call(BASE_OPTS)).rejects.toThrow('empty response')
  })

  it('throws a descriptive error on network failure', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'))
    const provider = new OpenAIProvider(config)
    await expect(provider.call(BASE_OPTS)).rejects.toThrow('Could not reach')
  })

  it('throws a timeout error when AbortController fires', async () => {
    // Simulate abort by rejecting with a DOMException named AbortError
    const abortErr = new DOMException('The operation was aborted.', 'AbortError')
    fetchSpy.mockRejectedValue(abortErr)

    // Stub AbortController so it fires immediately
    const originalAbortController = globalThis.AbortController
    const mockSignal = { aborted: true }
    const mockController = { abort: vi.fn(), signal: mockSignal }
    vi.stubGlobal('AbortController', vi.fn(() => mockController))

    const provider = new OpenAIProvider(config)
    await expect(provider.call(BASE_OPTS)).rejects.toThrow('did not respond within 120s')

    vi.stubGlobal('AbortController', originalAbortController)
  })
})

// ── CopilotProvider tests ─────────────────────────────────────────────────────

describe('CopilotProvider', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  function mockSessionTokenResponse(token = 'session-tok', expiresInMs = 30 * 60 * 1000) {
    return {
      ok: true,
      text: () => Promise.resolve(''),
      json: () =>
        Promise.resolve({
          token,
          expires_at: new Date(Date.now() + expiresInMs).toISOString(),
        }),
    }
  }

  function mockChatResponse(content = 'Copilot response') {
    return {
      ok: true,
      text: () => Promise.resolve(''),
      json: () =>
        Promise.resolve({ choices: [{ message: { content } }] }),
    }
  }

  it('fetches a session token before the first call', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockSessionTokenResponse())
      .mockResolvedValueOnce(mockChatResponse())

    const provider = new CopilotProvider('gh-token')
    await provider.call(BASE_OPTS)

    // First fetch should be to the session token endpoint
    expect(fetchSpy.mock.calls[0][0]).toContain('copilot_internal')
  })

  it('reuses cached session token without refetching', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockSessionTokenResponse())
      .mockResolvedValueOnce(mockChatResponse())
      .mockResolvedValueOnce(mockChatResponse())

    const provider = new CopilotProvider('gh-token')
    await provider.call(BASE_OPTS)
    await provider.call(BASE_OPTS)

    // Only one session token fetch for two calls
    const sessionFetches = fetchSpy.mock.calls.filter(([url]) =>
      (url as string).includes('copilot_internal')
    )
    expect(sessionFetches).toHaveLength(1)
  })

  it('throws a descriptive error when session token fetch fails', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    })

    const provider = new CopilotProvider('bad-token')
    await expect(provider.call(BASE_OPTS)).rejects.toThrow('Copilot subscription')
  })

  it('refreshes session token when nearing expiry', async () => {
    // First token expires in 30 seconds (within the 60s refresh window)
    const nearExpiry = new Date(Date.now() + 30_000).toISOString()
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'old-tok', expires_at: nearExpiry }),
      })
      .mockResolvedValueOnce(mockChatResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: 'new-tok',
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          }),
      })
      .mockResolvedValueOnce(mockChatResponse())

    const provider = new CopilotProvider('gh-token')
    await provider.call(BASE_OPTS) // first call — sets near-expiry token
    await provider.call(BASE_OPTS) // second call — should refresh

    const sessionFetches = fetchSpy.mock.calls.filter(([url]) =>
      (url as string).includes('copilot_internal')
    )
    expect(sessionFetches).toHaveLength(2)
  })
})
