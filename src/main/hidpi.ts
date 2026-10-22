import { existsSync, readFileSync } from 'node:fs'

/** Width and height of a PNG, GIF, BMP or JPEG; undefined for anything else or a truncated file. */
export function imageSize(data: Buffer): { w: number; h: number } | undefined {
  if (data.length >= 24 && data.readUInt32BE(0) === 0x89504e47) return { w: data.readUInt32BE(16), h: data.readUInt32BE(20) }
  if (data.length >= 10 && data.toString('latin1', 0, 3) === 'GIF') return { w: data.readUInt16LE(6), h: data.readUInt16LE(8) }
  if (data.length >= 26 && data.toString('latin1', 0, 2) === 'BM') return { w: Math.abs(data.readInt32LE(18)), h: Math.abs(data.readInt32LE(22)) }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2
    while (i + 9 < data.length && data[i] === 0xff) {
      const marker = data[i + 1]
      // SOF0..SOF15 carry the size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but do not.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { w: data.readUInt16BE(i + 7), h: data.readUInt16BE(i + 5) }
      i += 2 + data.readUInt16BE(i + 2)
    }
  }
  return undefined
}

/**
 * Redrawn art ships as `name@2x.png` (PNG or APNG, twice the size) next to the
 * original `name.png|gif|bmp|jpg`. A plain image file cannot tell the browser
 * its density, so image requests get an SVG with the original's size that
 * embeds the 2x bitmap: layouts stay the same, HiDPI screens get the real
 * pixels. Undefined when the file has no @2x twin, or the twin is not twice
 * the original: an SVG sized from it showed a shop item ten times too big when
 * a replaced @2x was larger, and one no bigger than the original would only
 * blur it (shequ.png); the original is served instead.
 */
export function hidpiSvg(file: string): string | undefined {
  const hi = file.replace(/\.(png|gif|bmp|jpg)$/i, '@2x.png')
  if (hi === file || !existsSync(hi)) return undefined
  const size = imageSize(readFileSync(file))
  const png = readFileSync(hi)
  const twin = imageSize(png)
  if (!size || !twin || Math.abs(twin.w - 2 * size.w) > 1 || Math.abs(twin.h - 2 * size.h) > 1) return undefined
  const { w, h } = size
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
    `<image href="data:image/png;base64,${png.toString('base64')}" width="${w}" height="${h}" preserveAspectRatio="none"/></svg>`
  )
}
