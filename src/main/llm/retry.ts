import type { LLMProvider, LLMCallOptions } from './provider'

export interface RetryInfo {
  attempt: number
  maxRetries: number
  delayMs: number
  reason: string
}

export interface RetryOptions {
  maxRetries?: number
  /** Called before each backoff wait — e.g. to surface it in the activity log. */
  onRetry?: (info: RetryInfo) => void
  /** Checked before waiting; return false to abort instead of retrying. */
  shouldContinue?: () => boolean
}

// Error-message signals that mean "transient — worth retrying".
const RETRYABLE_PATTERNS = [
  /\b429\b/,
  /\b502\b/,
  /\b503\b/,
  /\b529\b/,
  /too many requests/i,
  /rate.?limit/i,
  /quota/i,
  /overloaded/i,
  /high demand/i,
  /resource[_ ]exhausted/i,
  /unavailable/i,
  /temporarily/i,
  /did not respond within/i
]

function isRetryable(message: string): boolean {
  return RETRYABLE_PATTERNS.some(re => re.test(message))
}

/** Extracts a server-suggested retry delay (ms) from an error message, if any. */
function suggestedDelayMs(message: string): number | null {
  const match =
    message.match(/retry in ([\d.]+)\s*s/i) ||
    message.match(/"retryDelay"\s*:\s*"?([\d.]+)\s*s/i) ||
    message.match(/retry[- ]after["':\s]+([\d.]+)/i)
  if (match) {
    const seconds = parseFloat(match[1])
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 90_000)
    }
  }
  return null
}

function backoffMs(attempt: number): number {
  // Exponential (2s, 4s, 8s, …) capped at 32s, plus jitter.
  const base = Math.min(2000 * 2 ** (attempt - 1), 32_000)
  return base + Math.random() * 1000
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wraps any LLMProvider so that rate-limit and overload errors are retried
 * with exponential backoff. A server-suggested delay (e.g. Gemini's
 * "retry in 54s") is honored when present.
 */
export class RetryingProvider implements LLMProvider {
  name: string

  constructor(
    private readonly inner: LLMProvider,
    private readonly opts: RetryOptions = {}
  ) {
    this.name = inner.name
  }

  async call(options: LLMCallOptions): Promise<string> {
    const maxRetries = this.opts.maxRetries ?? 4
    let attempt = 0
    for (;;) {
      try {
        return await this.inner.call(options)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (attempt >= maxRetries || !isRetryable(message)) throw err
        if (this.opts.shouldContinue && !this.opts.shouldContinue()) throw err

        attempt++
        const delayMs = suggestedDelayMs(message) ?? backoffMs(attempt)
        this.opts.onRetry?.({ attempt, maxRetries, delayMs, reason: message })
        await sleep(delayMs)
      }
    }
  }
}
