import { describe, it, expect, vi, beforeEach } from 'vitest'
import keytar from 'keytar'
import { normalizeDomain, getCredentialForUrl, setCredential } from '../../main/credentials'

beforeEach(() => {
  vi.mocked(keytar.findCredentials).mockResolvedValue([])
  vi.mocked(keytar.getPassword).mockResolvedValue(null)
  vi.mocked(keytar.setPassword).mockResolvedValue(undefined)
  vi.mocked(keytar.deletePassword).mockResolvedValue(true)
})

describe('normalizeDomain', () => {
  it('strips https scheme and www', () => {
    expect(normalizeDomain('https://www.example.com')).toBe('example.com')
  })

  it('strips http scheme', () => {
    expect(normalizeDomain('http://example.com')).toBe('example.com')
  })

  it('strips path component', () => {
    expect(normalizeDomain('https://example.com/some/path')).toBe('example.com')
  })

  it('lowercases the result', () => {
    expect(normalizeDomain('HTTPS://WWW.EXAMPLE.COM')).toBe('example.com')
  })

  it('is idempotent for bare domains', () => {
    expect(normalizeDomain('example.com')).toBe('example.com')
  })

  it('strips only leading www', () => {
    expect(normalizeDomain('https://app.www.example.com')).toBe('app.www.example.com')
  })

  it('trims whitespace', () => {
    expect(normalizeDomain('  https://example.com  ')).toBe('example.com')
  })
})

describe('getCredentialForUrl', () => {
  it('returns null when no credentials stored', async () => {
    const result = await getCredentialForUrl('https://example.com')
    expect(result).toBeNull()
  })

  it('returns null for malformed URL', async () => {
    const result = await getCredentialForUrl('not-a-url')
    // non-http URL parsed as path — hostname is empty so no match
    expect(result).toBeNull()
  })

  it('matches exact domain', async () => {
    vi.mocked(keytar.findCredentials).mockResolvedValue([
      {
        account: 'cred:example.com',
        password: JSON.stringify({ username: 'alice', password: 'secret' }),
      },
    ])

    const result = await getCredentialForUrl('https://example.com/login')
    expect(result).toEqual({ username: 'alice', password: 'secret' })
  })

  it('matches subdomain against stored base domain', async () => {
    vi.mocked(keytar.findCredentials).mockResolvedValue([
      {
        account: 'cred:example.com',
        password: JSON.stringify({ username: 'alice', password: 'secret' }),
      },
    ])

    const result = await getCredentialForUrl('https://app.example.com')
    expect(result).toEqual({ username: 'alice', password: 'secret' })
  })

  it('prefers most specific (longest) matching domain', async () => {
    vi.mocked(keytar.findCredentials).mockResolvedValue([
      {
        account: 'cred:example.com',
        password: JSON.stringify({ username: 'broad', password: 'broad-pass' }),
      },
      {
        account: 'cred:api.example.com',
        password: JSON.stringify({ username: 'specific', password: 'specific-pass' }),
      },
    ])

    const result = await getCredentialForUrl('https://api.example.com/v1')
    expect(result).toEqual({ username: 'specific', password: 'specific-pass' })
  })

  it('strips www from URL hostname before matching', async () => {
    vi.mocked(keytar.findCredentials).mockResolvedValue([
      {
        account: 'cred:example.com',
        password: JSON.stringify({ username: 'alice', password: 'secret' }),
      },
    ])

    const result = await getCredentialForUrl('https://www.example.com')
    expect(result).toEqual({ username: 'alice', password: 'secret' })
  })

  it('does not match unrelated domain', async () => {
    vi.mocked(keytar.findCredentials).mockResolvedValue([
      {
        account: 'cred:other.com',
        password: JSON.stringify({ username: 'alice', password: 'secret' }),
      },
    ])

    const result = await getCredentialForUrl('https://example.com')
    expect(result).toBeNull()
  })

  it('silently skips malformed keychain entries', async () => {
    vi.mocked(keytar.findCredentials).mockResolvedValue([
      { account: 'cred:example.com', password: 'not-valid-json' },
    ])

    const result = await getCredentialForUrl('https://example.com')
    expect(result).toBeNull()
  })

  it('handles credentials without password field', async () => {
    vi.mocked(keytar.findCredentials).mockResolvedValue([
      { account: 'cred:example.com', password: JSON.stringify({ username: 'alice' }) },
    ])

    const result = await getCredentialForUrl('https://example.com')
    expect(result).toBeNull()
  })
})

describe('setCredential', () => {
  it('throws for empty domain', async () => {
    await expect(setCredential('', 'user', 'pass')).rejects.toThrow(
      'A valid domain is required'
    )
  })

  it('normalizes domain before storing', async () => {
    await setCredential('https://www.example.com/path', 'alice', 'secret')
    expect(vi.mocked(keytar.setPassword)).toHaveBeenCalledWith(
      'guidance-studio',
      'cred:example.com',
      JSON.stringify({ username: 'alice', password: 'secret' })
    )
  })
})
