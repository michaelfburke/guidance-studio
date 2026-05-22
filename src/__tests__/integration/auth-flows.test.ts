import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock `shell` from electron (already aliased in vitest.config.ts via the electron mock)
// pollDeviceFlow uses fetch; openrouterOAuth uses shell + http server + fetch

describe('pollDeviceFlow', () => {
  // pollDeviceFlow requires COPILOT_CLIENT_ID to be non-empty.
  // We use vi.resetModules() + dynamic import to reload the module with the env var set.

  const FAKE_CLIENT_ID = 'fake-client-id-for-tests'
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    process.env.GITHUB_COPILOT_CLIENT_ID = FAKE_CLIENT_ID
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete process.env.GITHUB_COPILOT_CLIENT_ID
  })

  it('throws when COPILOT_CLIENT_ID is not configured', async () => {
    delete process.env.GITHUB_COPILOT_CLIENT_ID
    vi.resetModules()
    const { pollDeviceFlow } = await import('../../main/auth/github-device-flow')
    await expect(pollDeviceFlow('code', 5)).rejects.toThrow('not configured')
  })

  it('returns access token on immediate success', async () => {
    fetchSpy.mockResolvedValue({
      json: () => Promise.resolve({ access_token: 'gh_tok_abc' }),
    })
    const { pollDeviceFlow } = await import('../../main/auth/github-device-flow')
    const resultPromise = pollDeviceFlow('device-code', 5)

    // Advance past the initial sleep (5000ms minimum)
    await vi.advanceTimersByTimeAsync(5_100)
    const result = await resultPromise

    expect(result).toBe('gh_tok_abc')
  })

  it('continues polling on authorization_pending', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 'authorization_pending' }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ access_token: 'gh_tok_final' }),
      })

    const { pollDeviceFlow } = await import('../../main/auth/github-device-flow')
    const resultPromise = pollDeviceFlow('device-code', 5)

    // Two polling intervals
    await vi.advanceTimersByTimeAsync(10_200)
    const result = await resultPromise

    expect(result).toBe('gh_tok_final')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('throws on expired_token error', async () => {
    fetchSpy.mockResolvedValue({
      json: () => Promise.resolve({ error: 'expired_token' }),
    })

    const { pollDeviceFlow } = await import('../../main/auth/github-device-flow')
    const resultPromise = pollDeviceFlow('device-code', 5)
    // Attach catch BEFORE advancing timers to prevent unhandled rejection
    const assertion = expect(resultPromise).rejects.toThrow('expired')
    await vi.advanceTimersByTimeAsync(5_100)
    await assertion
  })

  it('throws on access_denied error', async () => {
    fetchSpy.mockResolvedValue({
      json: () => Promise.resolve({ error: 'access_denied' }),
    })

    const { pollDeviceFlow } = await import('../../main/auth/github-device-flow')
    const resultPromise = pollDeviceFlow('device-code', 5)
    const assertion = expect(resultPromise).rejects.toThrow('denied')
    await vi.advanceTimersByTimeAsync(5_100)
    await assertion
  })

  it('honors abort signal before first poll', async () => {
    const controller = new AbortController()
    controller.abort()

    const { pollDeviceFlow } = await import('../../main/auth/github-device-flow')
    await expect(pollDeviceFlow('device-code', 5, controller.signal)).rejects.toThrow(
      'cancelled'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('handles slow_down by waiting an extra interval', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 'slow_down', interval: 5 }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ access_token: 'gh_tok_slow' }),
      })

    const { pollDeviceFlow } = await import('../../main/auth/github-device-flow')
    const resultPromise = pollDeviceFlow('device-code', 5)

    // First interval (5s) + slow_down extra (5s) + second interval (5s)
    await vi.advanceTimersByTimeAsync(15_500)
    const result = await resultPromise

    expect(result).toBe('gh_tok_slow')
  })
})

describe('startDeviceFlow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GITHUB_COPILOT_CLIENT_ID
  })

  it('throws when COPILOT_CLIENT_ID is not configured', async () => {
    delete process.env.GITHUB_COPILOT_CLIENT_ID
    vi.resetModules()
    const { startDeviceFlow } = await import('../../main/auth/github-device-flow')
    await expect(startDeviceFlow()).rejects.toThrow('not configured')
  })

  it('returns device challenge on success', async () => {
    process.env.GITHUB_COPILOT_CLIENT_ID = 'test-client'
    vi.resetModules()

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          device_code: 'dev-code-123',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { startDeviceFlow } = await import('../../main/auth/github-device-flow')
    const challenge = await startDeviceFlow()

    expect(challenge.deviceCode).toBe('dev-code-123')
    expect(challenge.userCode).toBe('ABCD-1234')
    expect(challenge.verificationUri).toBe('https://github.com/login/device')
    expect(challenge.interval).toBe(5)
  })

  it('throws on non-ok response from GitHub', async () => {
    process.env.GITHUB_COPILOT_CLIENT_ID = 'test-client'
    vi.resetModules()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Unprocessable Entity'),
    }))

    const { startDeviceFlow } = await import('../../main/auth/github-device-flow')
    await expect(startDeviceFlow()).rejects.toThrow('422')
  })
})

describe('openrouterOAuth', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('resolves with the API key on successful OAuth exchange', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ key: 'sk-or-test-key' }),
    }))

    const { openrouterOAuth } = await import('../../main/auth/openrouter-oauth')
    const { shell } = await import('electron')

    // Capture the callback URL when shell.openExternal is called
    let capturedCallbackUrl = ''
    const urlCaptured = new Promise<void>(resolve => {
      vi.mocked(shell.openExternal).mockImplementationOnce(async (url: string) => {
        const parsed = new URL(url)
        capturedCallbackUrl = parsed.searchParams.get('callback_url')! + '?code=test-auth-code'
        resolve()
      })
    })

    const oauthPromise = openrouterOAuth()

    // Wait for the server to start and shell.openExternal to be called
    await urlCaptured

    // Simulate the browser redirect by hitting the callback endpoint
    const { get } = await import('http')
    await new Promise<void>((resolve, reject) => {
      const req = get(capturedCallbackUrl, res => {
        res.resume()
        res.on('end', resolve)
      })
      req.on('error', reject)
    })

    const key = await oauthPromise
    expect(key).toBe('sk-or-test-key')
  })

  it('rejects when OpenRouter does not return an API key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}), // no key field
    }))

    const { openrouterOAuth } = await import('../../main/auth/openrouter-oauth')
    const { shell } = await import('electron')

    let capturedCallbackUrl = ''
    const urlCaptured = new Promise<void>(resolve => {
      vi.mocked(shell.openExternal).mockImplementationOnce(async (url: string) => {
        const parsed = new URL(url)
        capturedCallbackUrl = parsed.searchParams.get('callback_url')! + '?code=test-code'
        resolve()
      })
    })

    const oauthPromise = openrouterOAuth()
    // Attach rejection handler immediately to prevent unhandled rejection warning
    const assertion = expect(oauthPromise).rejects.toThrow('did not return an API key')
    await urlCaptured

    const { get } = await import('http')
    await new Promise<void>((resolve, reject) => {
      const req = get(capturedCallbackUrl, res => {
        res.resume()
        res.on('end', resolve)
      })
      req.on('error', reject)
    })

    await assertion
  })
})
