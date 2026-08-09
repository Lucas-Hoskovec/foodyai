/**
 * Browser image helpers for the photo scanner and uploads.
 *
 * Every image is re-encoded before it's sent or stored:
 * - scans   -> ≤720px JPEG data URL (small, cheap for the vision model)
 * - uploads -> ≤maxEdge WebP (the most byte-efficient format browsers can
 *   produce); the original file is kept when the canvas can't decode it (e.g.
 *   HEIC) so uploads never start failing on a once-valid format.
 *
 * Decode failures surface a typed `ScanError` (kind `decode`) instead of
 * crashing the page.
 */
import { ScanError } from './vision'

const SCAN_MAX_EDGE = 720
const JPEG_QUALITY = 0.8
const WEBP_QUALITY = 0.85

export interface ImageEncodeOptions {
  maxEdge: number
  /** JPEG quality override (0–1). Ignored for WebP. */
  quality?: number
}

/** Read a File, decode it, and return a ≤720px JPEG data URL for scanning. */
export function downscaleImageFile(file: File): Promise<string> {
  return decodeImage(file).then((img) => {
    const canvas = scaleToCanvas(img, SCAN_MAX_EDGE)
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  })
}

/**
 * Re-encode an image for storage, preferring WebP (smaller than JPEG for
 * photos) with a JPEG fallback for browsers that can't encode WebP. Falls
 * back to the original file if it can't be decoded at all.
 */
export async function compressImageFile(file: File, options: ImageEncodeOptions): Promise<File> {
  try {
    const img = await decodeImage(file)
    const canvas = scaleToCanvas(img, options.maxEdge)

    const webp = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY)
    const blob = webp && webp.type === 'image/webp' ? webp : await canvasToBlob(canvas, 'image/jpeg', options.quality ?? JPEG_QUALITY)
    if (!blob) return file

    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([blob], `${base}.${ext}`, { type: blob.type, lastModified: file.lastModified })
  } catch {
    return file
  }
}

function decodeImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new ScanError('decode', 'The photo could not be read. Pick a clear JPG or PNG and try again.'))
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) {
        reject(new ScanError('decode', 'The photo could not be read. Pick a clear JPG or PNG and try again.'))
        return
      }
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () =>
        reject(new ScanError('decode', 'This photo format couldn’t be opened. Try a clear JPG or PNG instead.'))
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

function scaleToCanvas(img: HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  const scale = Math.min(1, maxEdge / longest)
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(img, 0, 0, width, height)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement, format: 'image/jpeg' | 'image/webp', quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, format, quality))
}