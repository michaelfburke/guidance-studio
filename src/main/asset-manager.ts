import fs from 'fs'
import path from 'path'
import { nativeImage } from 'electron'
import { getRunDir } from './storage'

export interface SaveAssetOptions {
  runId: string
  filename: string
  data: Buffer | string
}

export function saveAsset(options: SaveAssetOptions): string {
  const { runId, filename, data } = options
  const runDir = getRunDir(runId)
  fs.mkdirSync(runDir, { recursive: true })

  const filePath = path.join(runDir, filename)
  if (typeof data === 'string') {
    // base64 string
    const buf = Buffer.from(data, 'base64')
    fs.writeFileSync(filePath, buf)
  } else {
    fs.writeFileSync(filePath, data)
  }
  return filePath
}

export function saveScreenshot(runId: string, stepIndex: number, imageData: string): string {
  const filename = `step-${String(stepIndex).padStart(3, '0')}.png`
  return saveAsset({ runId, filename, data: imageData })
}

/** Detects the image type from its magic bytes. */
export function imageMimeType(buf: Buffer): 'image/jpeg' | 'image/png' {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg'
  }
  return 'image/png'
}

/**
 * Downscales and JPEG-compresses an image before it is sent to an LLM.
 * Full-resolution UI screenshots otherwise inflate request size dramatically —
 * which is slow, costly, and can stall providers. The on-disk PNG is untouched;
 * this only affects what the model receives. Falls back to the original buffer
 * if conversion fails.
 */
export function toLLMImage(image: Buffer, maxWidth = 1000, quality = 55): Buffer {
  try {
    let img = nativeImage.createFromBuffer(image)
    if (img.isEmpty()) return image
    if (img.getSize().width > maxWidth) {
      img = img.resize({ width: maxWidth })
    }
    const jpeg = img.toJPEG(quality)
    return jpeg.length > 0 ? jpeg : image
  } catch {
    return image
  }
}

export function saveRecording(runId: string, index: number, data: Buffer): string {
  const runDir = getRunDir(runId)
  const recDir = path.join(runDir, 'recordings')
  fs.mkdirSync(recDir, { recursive: true })

  const filename = `recording-${String(index).padStart(3, '0')}.webm`
  const filePath = path.join(recDir, filename)
  fs.writeFileSync(filePath, data)
  return filePath
}
