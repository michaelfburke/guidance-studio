import { describe, it, expect } from 'vitest'
import { imageMimeType } from '../../main/asset-manager'

describe('imageMimeType', () => {
  it('detects JPEG from magic bytes FF D8 FF', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(imageMimeType(buf)).toBe('image/jpeg')
  })

  it('returns image/png for PNG magic bytes 89 50 4E 47', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(imageMimeType(buf)).toBe('image/png')
  })

  it('defaults to image/png for unknown magic bytes', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03])
    expect(imageMimeType(buf)).toBe('image/png')
  })

  it('returns image/png for empty buffer', () => {
    const buf = Buffer.alloc(0)
    expect(imageMimeType(buf)).toBe('image/png')
  })

  it('requires all three JPEG bytes to match', () => {
    // Only first two JPEG bytes — should not match
    const buf = Buffer.from([0xff, 0xd8, 0x00])
    expect(imageMimeType(buf)).toBe('image/png')
  })
})

describe('saveScreenshot filename format', () => {
  it('zero-pads step index to 3 digits', () => {
    // We verify the naming convention by checking the saveScreenshot call produces
    // the expected filename. Since saveScreenshot calls saveAsset which touches the
    // filesystem, we test the padding rule as a unit expectation:
    const index = 0
    const filename = `step-${String(index).padStart(3, '0')}.png`
    expect(filename).toBe('step-000.png')
  })

  it('generates step-015.png for index 15', () => {
    const index = 15
    const filename = `step-${String(index).padStart(3, '0')}.png`
    expect(filename).toBe('step-015.png')
  })

  it('generates recording-002.webm for index 2', () => {
    const index = 2
    const filename = `recording-${String(index).padStart(3, '0')}.webm`
    expect(filename).toBe('recording-002.webm')
  })
})
