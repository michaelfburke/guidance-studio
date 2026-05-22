import keytar from 'keytar'

/**
 * Per-site login credentials, stored in the OS keychain (never on disk).
 * Each credential is keyed by domain under the account `cred:<domain>`, with
 * the username + password held together as a JSON value.
 */
const SERVICE = 'guidance-studio'
const PREFIX = 'cred:'

async function safeFind(service: string): Promise<Array<{ account: string; password: string }>> {
  try {
    return await keytar.findCredentials(service)
  } catch {
    return []
  }
}

export interface StoredCredential {
  domain: string
  username: string
}

export interface CredentialSecret {
  username: string
  password: string
}

/** Reduces a domain or pasted URL to a bare, lower-cased host (no scheme, no www). */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
}

function parseSecret(raw: string): CredentialSecret | null {
  try {
    const parsed = JSON.parse(raw) as CredentialSecret
    if (typeof parsed?.password === 'string') {
      return { username: parsed.username ?? '', password: parsed.password }
    }
  } catch {
    /* malformed entry — ignore */
  }
  return null
}

/** Lists stored credentials WITHOUT passwords — safe to send to the renderer. */
export async function listCredentials(): Promise<StoredCredential[]> {
  const all = await safeFind(SERVICE)
  return all
    .filter(c => c.account.startsWith(PREFIX))
    .map(c => ({
      domain: c.account.slice(PREFIX.length),
      username: parseSecret(c.password)?.username ?? ''
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain))
}

export async function setCredential(
  domain: string,
  username: string,
  password: string
): Promise<void> {
  const d = normalizeDomain(domain)
  if (!d) throw new Error('A valid domain is required')
  await keytar.setPassword(SERVICE, PREFIX + d, JSON.stringify({ username, password }))
}

export async function deleteCredential(domain: string): Promise<void> {
  await keytar.deletePassword(SERVICE, PREFIX + normalizeDomain(domain))
}

/** Finds the most specific stored credential matching a run's URL, if any. */
export async function getCredentialForUrl(url: string): Promise<CredentialSecret | null> {
  let host: string
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase()
  } catch {
    return null
  }
  host = host.replace(/^www\./, '')

  const all = await safeFind(SERVICE)
  let best: { domain: string; secret: CredentialSecret } | null = null
  for (const c of all) {
    if (!c.account.startsWith(PREFIX)) continue
    const domain = c.account.slice(PREFIX.length)
    if (host !== domain && !host.endsWith(`.${domain}`)) continue
    const secret = parseSecret(c.password)
    if (!secret) continue
    // Prefer the longest (most specific) matching domain.
    if (!best || domain.length > best.domain.length) {
      best = { domain, secret }
    }
  }
  return best?.secret ?? null
}
