import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

// Compile hidpi.ts on the fly via the project's tsx/ts-node, or import built output.
const dir = mkdtempSync(join(tmpdir(), 'hidpi-'))
const require = createRequire(import.meta.url)

// Prefer built JS if present after electron-vite build; else transpile with esbuild.
let hidpiSvg, imageSize
try {
  ;({ hidpiSvg, imageSize } = await import('../src/main/hidpi.ts'))
} catch {
  const esbuild = require('esbuild')
  const outfile = join(dir, 'hidpi.mjs')
  await esbuild.build({ entryPoints: ['src/main/hidpi.ts'], outfile, format: 'esm', platform: 'node', bundle: true })
  ;({ hidpiSvg, imageSize } = await import(outfile))
}

function png(w, h, rgba = [0, 255, 0, 255], pad = 0) {
  // minimal uncompressed-ish PNG via sharp if available, else pure JS IHDR+IDAT
  const sharp = (() => { try { return require('sharp') } catch { return null } })()
  if (sharp) {
    const buf = Buffer.alloc(w * h * 4)
    for (let i = 0; i < w * h; i++) buf.set(rgba, i * 4)
    let img = sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png()
    return img.toBuffer()
  }
  // fallback: write via sips/python
  const raw = join(dir, `r${w}x${h}.rgba`)
  const out = join(dir, `r${w}x${h}.png`)
  const buf = Buffer.alloc(w * h * 4 + pad)
  for (let i = 0; i < w * h; i++) buf.set(rgba, i * 4)
  writeFileSync(raw, buf.subarray(0, w * h * 4))
  execFileSync('python3', ['-c', `
from PIL import Image
im=Image.frombytes('RGBA', (${w},${h}), open(${JSON.stringify(raw)},'rb').read())
im.save(${JSON.stringify(out)})
`])
  const pngBuf = readFileSync(out)
  if (pad) {
    // append junk after IEND to inflate size for "large" tests if needed — skip, we always base64 now
  }
  return pngBuf
}

describe('hidpi', () => {
  it('imageSize reads PNG dimensions', async () => {
    const buf = await png(50, 50)
    assert.deepEqual(imageSize(buf), { w: 50, h: 50 })
  })

  it('hidpiSvg accepts exact 2× and larger twins; rejects undersized; always base64', async () => {
    const base = join(dir, 'icon.gif')
    // GIF 50x50
    writeFileSync(base, await (async () => {
      // write gif via pillow
      const out = join(dir, 'icon.gif')
      execFileSync('python3', ['-c', `
from PIL import Image
Image.new('RGB',(50,50),(1,2,3)).save(${JSON.stringify(out)},'GIF')
`])
      return readFileSync(out)
    })())

    const exact = join(dir, 'icon@2x.png')
    writeFileSync(exact, await png(100, 100))
    const svg1 = hidpiSvg(base)
    assert.ok(svg1.includes('width="50"'))
    assert.ok(svg1.includes('data:image/png;base64,'))
    assert.ok(!svg1.includes('href="icon@2x.png"'))

    // larger than 2× (repair-style)
    writeFileSync(exact, await png(1254, 1254))
    const svg2 = hidpiSvg(base)
    assert.ok(svg2.includes('width="50"'))
    assert.ok(svg2.includes('data:image/png;base64,'))
    assert.ok(svg2.length > 1000)

    // undersized rejected
    writeFileSync(exact, await png(60, 60))
    assert.equal(hidpiSvg(base), undefined)
  })
})
