import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RetryingProvider, type RetryInfo } from '../../main/llm/retry'
import type { LLMProvider, LLMCallOptions } from '../../main/llm/provider'

function makeMockProvider(): LLMProvider & { call: ReturnType<typeof vi.fn> } {
  return { name: 'mock', call: vi.fn() }
}

describe('RetryingProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns result on first success without retrying', async () => {
    const inner = makeMockProvider()
    inner.call.mockResolvedValue('hello')
    const provider = new RetryingProvider(inner)

    const result = await provider.call({ prompt: 'test' })
    expect(result).toBe('hello')
    expect(inner.call).toHaveBeenCalledTimes(1)
  })

  it('forwards the name from the inner provider', () => {
    const inner = makeMockProvider()
    inner.name = 'gemini'
    const provider = new RetryingProvider(inner)
    expect(provider.name).toBe('gemini')
  })

  it('retries on 429 and succeeds on second attempt', async () => {
    const inner = makeMockProvider()
    inner.call
      .mockRejectedValueOnce(new Error('429 Too Many Requests'))
      .mockResolvedValueOnce('success')
    const onRetry = vi.fn()
    const provider = new RetryingProvider(inner, { maxRetries: 1, onRetry })

    const resultPromise = provider.call({ prompt: 'test' })
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result).toBe('success')
    expect(inner.call).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('retries on "rate limit" error message', async () => {
    const inner = makeMockProvider()
    inner.call
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockResolvedValueOnce('ok')
    const provider = new RetryingProvider(inner, { maxRetries: 1 })

    const resultPromise = provider.call({ prompt: 'test' })
    await vi.runAllTimersAsync()
    await resultPromise

    expect(inner.call).toHaveBeenCalledTimes(2)
  })

  it('retries on "overloaded" message (Claude 529)', async () => {
    const inner = makeMockProvider()
    inner.call
      .mockRejectedValueOnce(new Error('529 - Claude is overloaded'))
      .mockResolvedValueOnce('ok')
    const provider = new RetryingProvider(inner, { maxRetries: 1 })

    const resultPromise = provider.call({ prompt: 'test' })
    await vi.runAllTimersAsync()
    await resultPromise

    expect(inner.call).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on authentication errors', async () => {
    const inner = makeMockProvider()
    inner.call.mockRejectedValue(new Error('401 Unauthorized'))
    const provider = new RetryingProvider(inner, { maxRetries: 4 })

    await expect(provider.call({ prompt: 'test' })).rejects.toThrow('401 Unauthorized')
    expect(inner.call).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on invalid input errors', async () => {
    const inner = makeMockProvider()
    inner.call.mockRejectedValue(new Error('invalid input provided'))
    const provider = new RetryingProvider(inner, { maxRetries: 4 })

    await expect(provider.call({ prompt: 'test' })).rejects.toThrow('invalid input provided')
    expect(inner.call).toHaveBeenCalledTimes(1)
  })

  it('exhausts maxRetries and rethrows the last error', async () => {
    const inner = makeMockProvider()
    inner.call.mockRejectedValue(new Error('503 Service Unavailable'))
    const provider = new RetryingProvider(inner, { maxRetries: 2 })

    const resultPromise = provider.call({ prompt: 'test' })
    // Attach catch BEFORE advancing timers to prevent unhandled rejection
    const assertion = expect(resultPromise).rejects.toThrow('503 Service Unavailable')
    await vi.runAllTimersAsync()
    await assertion
    expect(inner.call).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })

  it('aborts immediately when shouldContinue returns false', async () => {
    const inner = makeMockProvider()
    inner.call.mockRejectedValue(new Error('429 Too Many Requests'))
    const provider = new RetryingProvider(inner, {
      maxRetries: 4,
      shouldContinue: () => false,
    })

    await expect(provider.call({ prompt: 'test' })).rejects.toThrow('429 Too Many Requests')
    expect(inner.call).toHaveBeenCalledTimes(1)
  })

  it('honors server-suggested delay in onRetry callback', async () => {
    const inner = makeMockProvider()
    inner.call
      .mockRejectedValueOnce(new Error('retry in 54s after quota reset'))
      .mockResolvedValueOnce('ok')

    const retryInfos: RetryInfo[] = []
    const provider = new RetryingProvider(inner, {
      maxRetries: 1,
      onRetry: info => retryInfos.push(info),
    })

    const resultPromise = provider.call({ prompt: 'test' })
    await vi.runAllTimersAsync()
    await resultPromise

    expect(retryInfos).toHaveLength(1)
    // Server suggested 54s — delay should be approximately 54000ms
    expect(retryInfos[0].delayMs).toBeCloseTo(54_000, -2)
  })

  it('passes correct attempt and maxRetries to onRetry', async () => {
    const inner = makeMockProvider()
    inner.call
      .mockRejectedValueOnce(new Error('503 unavailable'))
      .mockRejectedValueOnce(new Error('503 unavailable'))
      .mockResolvedValueOnce('ok')

    const retryInfos: RetryInfo[] = []
    const provider = new RetryingProvider(inner, {
      maxRetries: 4,
      onRetry: info => retryInfos.push(info),
    })

    const resultPromise = provider.call({ prompt: 'test' })
    await vi.runAllTimersAsync()
    await resultPromise

    expect(retryInfos[0].attempt).toBe(1)
    expect(retryInfos[0].maxRetries).toBe(4)
    expect(retryInfos[1].attempt).toBe(2)
  })

  it('uses exponential backoff without server suggestion', async () => {
    const inner = makeMockProvider()
    inner.call
      .mockRejectedValueOnce(new Error('429'))
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValueOnce('ok')

    const retryInfos: RetryInfo[] = []
    const provider = new RetryingProvider(inner, {
      maxRetries: 4,
      onRetry: info => retryInfos.push(info),
    })

    const resultPromise = provider.call({ prompt: 'test' })
    await vi.runAllTimersAsync()
    await resultPromise

    // Attempt 1 → base ~2000ms; attempt 2 → base ~4000ms
    expect(retryInfos[0].delayMs).toBeGreaterThanOrEqual(2000)
    expect(retryInfos[1].delayMs).toBeGreaterThanOrEqual(4000)
    expect(retryInfos[1].delayMs).toBeGreaterThan(retryInfos[0].delayMs)
  })
})
