// Renders the app and tray icons from SVG designs into high-quality PNGs
// (sharp/libvips). Outputs: build/icon.png and resources/tray*.png
import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Paper-card path with a folded (dog-eared) bottom-right corner.
function cardPath(x0, y0, x1, y1, r, f) {
  return `M ${x0 + r},${y0}
    H ${x1 - r} A ${r},${r} 0 0 1 ${x1},${y0 + r}
    V ${y1 - f} L ${x1 - f},${y1}
    H ${x0 + r} A ${r},${r} 0 0 1 ${x0},${y1 - r}
    V ${y0 + r} A ${r},${r} 0 0 1 ${x0 + r},${y0} Z`
}

// --- App icon (1024) -------------------------------------------------------
const APP_SVG = `
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#FFD95A"/>
      <stop offset="1" stop-color="#F7A81B"/>
    </linearGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#FFF4D8"/>
    </linearGradient>
    <linearGradient id="fold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F6E6AE"/>
      <stop offset="1" stop-color="#E4C877"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.38"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="bgShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#9A6200" flood-opacity="0.35"/>
    </filter>
    <filter id="cardShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="14" stdDeviation="22" flood-color="#7A4E00" flood-opacity="0.28"/>
    </filter>
  </defs>

  <!-- squircle background -->
  <rect x="112" y="112" width="800" height="800" rx="208" fill="url(#bg)" filter="url(#bgShadow)"/>
  <rect x="112" y="112" width="800" height="800" rx="208" fill="url(#sheen)"/>

  <!-- paper card (slightly rotated) -->
  <g transform="rotate(-5 512 512)">
    <path d="${cardPath(302, 292, 702, 692, 30, 128)}" fill="url(#paper)" filter="url(#cardShadow)"/>
    <path d="M ${702 - 128},${692 - 128} L 702,${692 - 128} L ${702 - 128},692 Z" fill="url(#fold)"/>

    <!-- task row: green check + line -->
    <circle cx="372" cy="392" r="26" fill="#37C15A"/>
    <path d="M 360 392 l 9 10 l 16 -19" fill="none" stroke="#FFFFFF" stroke-width="7"
          stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="418" y="379" width="196" height="26" rx="13" fill="#F2A21A"/>

    <!-- text lines -->
    <rect x="332" y="462" width="300" height="24" rx="12" fill="#F6B740" opacity="0.9"/>
    <rect x="332" y="524" width="300" height="24" rx="12" fill="#F6B740" opacity="0.75"/>
    <rect x="332" y="586" width="180" height="24" rx="12" fill="#F6B740" opacity="0.6"/>
  </g>
</svg>`

// --- Tray icon, colored (Windows/Linux) ------------------------------------
const TRAY_COLOR_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFD95A"/>
      <stop offset="1" stop-color="#F7A81B"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="88" height="88" rx="24" fill="url(#tb)"/>
  <path d="${cardPath(28, 26, 74, 74, 6, 16)}" fill="#FFFFFF"/>
  <path d="M ${74 - 16},${74 - 16} L 74,${74 - 16} L ${74 - 16},74 Z" fill="#E4C877"/>
  <rect x="35" y="37" width="26" height="5.5" rx="2.75" fill="#F2A21A"/>
  <rect x="35" y="48" width="26" height="5.5" rx="2.75" fill="#F6B740"/>
  <rect x="35" y="59" width="15" height="5.5" rx="2.75" fill="#F6B740"/>
</svg>`

// --- Tray icon, macOS template (monochrome silhouette) ---------------------
// A template image uses only alpha; the lines must be "holes" cut from the
// card (mask), not painted strokes.
const TRAY_TEMPLATE_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <mask id="cut">
    <rect width="100" height="100" fill="black"/>
    <path d="${cardPath(20, 15, 80, 77, 11, 26)}" fill="white"/>
    <rect x="31" y="33" width="31" height="7.5" rx="3.75" fill="black"/>
    <rect x="31" y="48" width="31" height="7.5" rx="3.75" fill="black"/>
    <rect x="31" y="63" width="19" height="7.5" rx="3.75" fill="black"/>
  </mask>
  <rect width="100" height="100" fill="black" mask="url(#cut)"/>
</svg>`

async function render(svg, size, rel) {
  const p = join(root, rel)
  mkdirSync(dirname(p), { recursive: true })
  const buf = await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  writeFileSync(p, buf)
  console.log('written:', rel, `${size}px`)
}

await render(APP_SVG, 1024, 'build/icon.png')
await render(TRAY_COLOR_SVG, 32, 'resources/tray.png')
await render(TRAY_COLOR_SVG, 64, 'resources/tray@2x.png')
await render(TRAY_TEMPLATE_SVG, 22, 'resources/trayTemplate.png')
await render(TRAY_TEMPLATE_SVG, 44, 'resources/trayTemplate@2x.png')
console.log('All icons generated.')
