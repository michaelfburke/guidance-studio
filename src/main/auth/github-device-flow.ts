/**
 * GitHub Device Authorization Flow (RFC 8628) for GitHub Copilot access.
 *
 * To enable this feature, register a GitHub OAuth App at
 * https://github.com/settings/developers and set the GITHUB_COPILOT_CLIENT_ID
 * environment variable to the app's client ID at build time.
 *
 * Required scopes: read:user
 * The resulting token is then exchanged for a short-lived Copilot API token
 * inside CopilotProvider.
 */

export const COPILOT_CLIENT_ID: string = process.env.GITHUB_COPILOT_CLIENT_ID ?? ''

export interface DeviceFlowChallenge {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

/** Step 1 — request a device code and show the user the verification URL + code. */
export async function startDeviceFlow(): Promise<DeviceFlowChallenge> {
  if (!COPILOT_CLIENT_ID) {
    throw new Error(
      'GitHub Copilot integration is not configured. ' +
      'Register a GitHub OAuth App and set GITHUB_COPILOT_CLIENT_ID.'
    )
  }

  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: COPILOT_CLIENT_ID, scope: 'read:user' })
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub device code request failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const data = await res.json() as {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval
  }
}

/** Step 2 — poll until the user completes authorisation; returns a GitHub OAuth token. */
export async function pollDeviceFlow(
  deviceCode: string,
  intervalSeconds: number,
  signal?: AbortSignal
): Promise<string> {
  if (!COPILOT_CLIENT_ID) {
    throw new Error('GitHub Copilot integration is not configured.')
  }

  const intervalMs = Math.max(intervalSeconds * 1000, 5_000)
  const deadline = Date.now() + 15 * 60_000

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Device flow cancelled.')
    await new Promise(r => setTimeout(r, intervalMs))
    if (signal?.aborted) throw new Error('Device flow cancelled.')

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: COPILOT_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })

    const data = await res.json() as {
      access_token?: string
      error?: string
      error_description?: string
      interval?: number
    }

    if (data.access_token) return data.access_token
    if (data.error === 'authorization_pending') continue
    if (data.error === 'slow_down') {
      await new Promise(r => setTimeout(r, (data.interval ?? 5) * 1000))
      continue
    }
    if (data.error === 'expired_token') throw new Error('The device code expired. Please try again.')
    if (data.error === 'access_denied') throw new Error('GitHub authorisation was denied.')
    throw new Error(data.error_description ?? data.error ?? 'Device flow polling failed.')
  }

  throw new Error('GitHub device flow timed out after 15 minutes.')
}
