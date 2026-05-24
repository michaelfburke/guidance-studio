import { describe, it, expect } from 'vitest'
import { parseAgentAction, applyCredentials } from '../../main/agent-orchestrator'
import type { CredentialSecret } from '../../main/credentials'

describe('parseAgentAction', () => {
  it('parses a clean JSON action', () => {
    const raw = JSON.stringify({
      title: 'Click Submit',
      description: 'Click the submit button',
      action: 'click',
      index: 3,
    })
    const result = parseAgentAction(raw)
    expect(result.action).toBe('click')
    expect(result.index).toBe(3)
    expect(result.title).toBe('Click Submit')
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n{"action":"navigate","value":"https://example.com","title":"Go home"}\n```'
    const result = parseAgentAction(raw)
    expect(result.action).toBe('navigate')
    expect(result.value).toBe('https://example.com')
  })

  it('extracts JSON from surrounding prose', () => {
    const raw = 'Here is my action: {"action":"scroll","title":"Scroll down"} — done.'
    const result = parseAgentAction(raw)
    expect(result.action).toBe('scroll')
  })

  it('defaults title when missing', () => {
    const raw = JSON.stringify({ action: 'click', index: 1 })
    const result = parseAgentAction(raw)
    expect(result.title).toBe('Step (click)')
  })

  it('trims whitespace from title and description', () => {
    const raw = JSON.stringify({
      action: 'type',
      index: 2,
      title: '  Type something  ',
      description: '  A description  ',
      value: 'hello',
    })
    const result = parseAgentAction(raw)
    expect(result.title).toBe('Type something')
    expect(result.description).toBe('A description')
  })

  it('defaults description to empty string when missing', () => {
    const raw = JSON.stringify({ action: 'done', title: 'Done' })
    const result = parseAgentAction(raw)
    expect(result.description).toBe('')
  })

  it('throws when action field is missing', () => {
    const raw = JSON.stringify({ title: 'No action here', index: 1 })
    expect(() => parseAgentAction(raw)).toThrow()
  })

  it('throws on an invalid action value', () => {
    const raw = JSON.stringify({ action: 'hover', index: 1 })
    expect(() => parseAgentAction(raw)).toThrow(/"action"/)
  })

  it('parses all five valid action types', () => {
    const cases: Array<Record<string, unknown>> = [
      { action: 'click', title: 'Click something', index: 0 },
      { action: 'type', title: 'Type something', index: 2, value: 'hello' },
      { action: 'navigate', title: 'Navigate', value: 'https://example.com' },
      { action: 'scroll', title: 'Scroll' },
      { action: 'done', title: 'Done' }
    ]
    for (const c of cases) {
      expect(() => parseAgentAction(JSON.stringify(c))).not.toThrow()
    }
  })

  it('throws on completely invalid JSON', () => {
    expect(() => parseAgentAction('this is not json')).toThrow()
  })
})

describe('applyCredentials', () => {
  const creds: CredentialSecret = { username: 'alice', password: 's3cr3t' }

  it('replaces {{username}} placeholder', () => {
    expect(applyCredentials('Login as {{username}}', creds)).toBe('Login as alice')
  })

  it('replaces {{password}} placeholder', () => {
    expect(applyCredentials('Enter {{password}}', creds)).toBe('Enter s3cr3t')
  })

  it('replaces both placeholders in one string', () => {
    expect(applyCredentials('{{username}}:{{password}}', creds)).toBe('alice:s3cr3t')
  })

  it('is case-insensitive for placeholder names', () => {
    expect(applyCredentials('{{USERNAME}} / {{PASSWORD}}', creds)).toBe('alice / s3cr3t')
  })

  it('handles whitespace inside braces', () => {
    expect(applyCredentials('{{ username }}', creds)).toBe('alice')
  })

  it('returns value unchanged when creds is null', () => {
    expect(applyCredentials('{{username}}', null)).toBe('{{username}}')
  })

  it('returns value unchanged when no placeholders present', () => {
    expect(applyCredentials('plain text', creds)).toBe('plain text')
  })
})
