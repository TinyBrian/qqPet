import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deflateSync } from 'node:zlib'
import { createRequire } from 'node:module'

const dir = mkdtempSync(join(tmpdir(), 'hidpi-'))
const require = createRequire(import.meta.url)

let hidpiSvg, imageSize
try {
  ;({ hidpiSvg, imageSize } = await import('../../src/main/hidpi.ts'))
} catch {
  const esbuild = require('esbuild')
  const outfile = join(dir, 'hidpi.mjs')
  await esbuild.build({ entryPoints: ['src/main/hidpi.ts'], outfile, format: 'esm', platform: 'node', bundle: true })
  ;({ hidpiSvg, imageSize } = await import(outfile))
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** Minimal solid RGBA PNG (no external deps). */
function png(w, h, rgba = [0, 255, 0, 255]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  const row = Buffer.alloc(1 + w * 4)
  for (let x = 0; x < w; x++) row.set(rgba, 1 + x * 4)
  const raw = Buffer.alloc(h * row.length)
  for (let y = 0; y < h; y++) row.copy(raw, y * row.length)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** Minimal solid RGB GIF87a (imageSize only needs screen descriptor). */
function gif(w, h, rgb = [1, 2, 3]) {
  const header = Buffer.from('GIF87a', 'ascii')
  const screen = Buffer.alloc(7)
  screen.writeUInt16LE(w, 0)
  screen.writeUInt16LE(h, 2)
  screen[4] = 0x80
  screen[5] = 0
  screen[6] = 0
  const gct = Buffer.from([rgb[0], rgb[1], rgb[2], 0, 0, 0])
  const image = Buffer.alloc(10)
  image[0] = 0x2c
  image.writeUInt16LE(0, 1)
  image.writeUInt16LE(0, 3)
  image.writeUInt16LE(w, 5)
  image.writeUInt16LE(h, 7)
  image[9] = 0
  const data = Buffer.from([0x02, 0x02, 0x44, 0x01, 0x00])
  const trailer = Buffer.from([0x3b])
  return Buffer.concat([header, screen, gct, image, data, trailer])
}

describe('hidpi', () => {
  it('imageSize reads PNG dimensions', () => {
    const buf = png(50, 50)
    assert.deepEqual(imageSize(buf), { w: 50, h: 50 })
  })

  it('hidpiSvg accepts exact 2× and larger twins; rejects undersized; always base64', () => {
    const base = join(dir, 'icon.gif')
    writeFileSync(base, gif(50, 50))
    assert.deepEqual(imageSize(readFileSync(base)), { w: 50, h: 50 })

    const exact = join(dir, 'icon@2x.png')
    writeFileSync(exact, png(100, 100))
    const svg1 = hidpiSvg(base)
    assert.ok(svg1?.includes('width="50"'))
    assert.ok(svg1?.includes('data:image/png;base64,'))
    assert.ok(!svg1?.includes('href="icon@2x.png"'))

    writeFileSync(exact, png(1254, 1254))
    const svg2 = hidpiSvg(base)
    assert.ok(svg2?.includes('width="50"'))
    assert.ok(svg2?.includes('data:image/png;base64,'))
    assert.ok(svg2.length > 1000)

    writeFileSync(exact, png(60, 60))
    assert.equal(hidpiSvg(base), undefined)
  })
})
