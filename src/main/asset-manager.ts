import fs from 'fs'
import path from 'path'
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

export function saveThumbnail(runId: string, stepIndex: number, imageData: string): string {
  const filename = `thumb-${String(stepIndex).padStart(3, '0')}.png`
  return saveAsset({ runId, filename, data: imageData })
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

export function generatePlaceholderPng(text: string, width = 800, height = 600): Buffer {
  // Generate a minimal PNG with step text embedded as a simple colored placeholder
  // We create a very basic PNG manually (1x1 pixel, gray) since we can't use canvas in main
  // The actual screenshot would come from the renderer in production
  const header = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a  // PNG signature
  ])

  // IHDR chunk: width=800, height=600, bit depth=8, color type=2 (RGB)
  const ihdrData = Buffer.allocUnsafe(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8   // bit depth
  ihdrData[9] = 2   // color type: RGB
  ihdrData[10] = 0  // compression
  ihdrData[11] = 0  // filter
  ihdrData[12] = 0  // interlace

  const ihdrChunk = makeChunk('IHDR', ihdrData)

  // Create a simple gradient image data
  const zlib = require('zlib')
  const rawData = Buffer.allocUnsafe(height * (1 + width * 3))
  for (let y = 0; y < height; y++) {
    const offset = y * (1 + width * 3)
    rawData[offset] = 0  // filter type: None
    for (let x = 0; x < width; x++) {
      const pixOffset = offset + 1 + x * 3
      // Dark slate background
      rawData[pixOffset] = 30     // R
      rawData[pixOffset + 1] = 41 // G
      rawData[pixOffset + 2] = 59 // B
    }
  }

  const compressed = zlib.deflateSync(rawData)
  const idatChunk = makeChunk('IDAT', compressed)
  const iendChunk = makeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk])
}

function makeChunk(type: string, data: Buffer): Buffer {
  const crc32 = require('zlib').crc32
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(data.length, 0)

  const crcInput = Buffer.concat([typeBuffer, data])
  let crc: number
  try {
    crc = crc32(crcInput)
  } catch {
    // fallback CRC calculation
    crc = computeCrc32(crcInput)
  }

  const crcBuffer = Buffer.allocUnsafe(4)
  crcBuffer.writeUInt32BE(crc >>> 0, 0)

  return Buffer.concat([length, typeBuffer, data, crcBuffer])
}

function computeCrc32(buf: Buffer): number {
  const table = makeCrcTable()
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makeCrcTable(): number[] {
  const table: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1)
      } else {
        c = c >>> 1
      }
    }
    table[n] = c
  }
  return table
}
