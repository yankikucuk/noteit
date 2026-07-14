/**
 * @file Client-side image downscaling for pasted/dropped images.
 *
 * Images are embedded in note HTML as base64 data URLs, so a full-resolution
 * screenshot could bloat the note (and every backup/export) by megabytes.
 * These helpers cap an embedded image's dimensions and re-encode it, keeping
 * notes lightweight.
 */

/** Maximum width/height (px) for an embedded image. */
const MAX_DIM = 1280

/** Re-encode quality for lossy (JPEG) output. */
const QUALITY = 0.82

/**
 * Downscales an image blob to fit within {@link MAX_DIM} (preserving aspect
 * ratio) and returns a data URL. PNGs keep PNG output to preserve transparency;
 * everything else is re-encoded as JPEG.
 * @param {Blob} file - Image blob from the clipboard or a drop.
 * @returns {Promise<string>} A `data:` URL.
 */
export function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      resolve(canvas.toDataURL(type, QUALITY))
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

/**
 * Returns the first image blob found in a clipboard/drag payload, or null.
 * @param {DataTransfer|null} dt - Clipboard or drop data.
 * @returns {Blob|null} The image blob, or null if none is present.
 */
export function firstImageFile(dt) {
  if (!dt) return null
  const fromFiles = dt.files ? [...dt.files] : []
  const fromItems = dt.items
    ? [...dt.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile())
    : []
  return [...fromFiles, ...fromItems].find((f) => f && f.type.startsWith('image/')) || null
}
