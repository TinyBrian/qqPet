/**
 * In-memory fixes for SWF text fields laid out for the original's device fonts. Ruffle draws device text in
 * our bundled CJK font, which is wider, so a tight box that wraps hides the tail of its text.
 */

/** Bit reader/writer over a SWF RECT. */
function readRect(b: Uint8Array, p: number): { n: number; v: number[]; end: number } {
  let bit = p * 8
  const u = (k: number): number => {
    let x = 0
    for (let i = 0; i < k; i++, bit++) x = (x << 1) | ((b[bit >> 3] >> (7 - (bit & 7))) & 1)
    return x
  }
  const n = u(5)
  const v = [0, 0, 0, 0].map(() => {
    const x = u(n)
    return n && x >> (n - 1) ? x - 2 ** n : x
  })
  return { n, v, end: Math.ceil(bit / 8) }
}

function writeRect(b: Uint8Array, p: number, n: number, v: number[]): void {
  let bit = p * 8 + 5
  for (const x of v)
    for (let i = n - 1; i >= 0; i--, bit++) {
      const m = 1 << (7 - (bit & 7))
      if (((x >> i) & 1) !== 0) b[bit >> 3] |= m
      else b[bit >> 3] &= ~m
    }
}

/** Uncompressed (FWS) bytes of a SWF; null for LZMA or anything unknown. */
async function inflate(swf: Uint8Array): Promise<Uint8Array | null> {
  const sig = String.fromCharCode(swf[0], swf[1], swf[2])
  if (sig === 'FWS') return swf
  if (sig !== 'CWS') return null
  const body = await new Response(new Blob([swf.slice(8)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()
  const out = new Uint8Array(8 + body.byteLength)
  out.set(swf.subarray(0, 8))
  out.set(new Uint8Array(body), 8)
  out[0] = 0x46 // 'F'
  new DataView(out.buffer).setUint32(4, out.length, true)
  return out
}

export interface TextFix {
  /** A piece of the field's initial (HTML) text that identifies it. */
  text: string
  /** Twips added on each side of the box. */
  grow: number
}

/**
 * Turns word wrap off and widens (about its centre) every DefineEditText whose initial text contains a fix's
 * `text`. Returns the patched SWF, or the original when nothing matched or it could not be read.
 */
export async function fixTextFields(swf: Uint8Array, fixes: TextFix[]): Promise<Uint8Array> {
  const b = await inflate(swf).catch(() => null)
  if (!b) return swf
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let p = readRect(b, 8).end + 4
  let hit = false
  while (p + 2 <= b.length) {
    const h = dv.getUint16(p, true)
    const code = h >> 6
    let len = h & 63
    p += 2
    if (len === 63) {
      len = dv.getUint32(p, true)
      p += 4
    }
    if (code === 0) break
    if (code === 37) {
      const r = readRect(b, p + 2)
      const flags = r.end
      const end = p + len
      const text = new TextDecoder().decode(b.subarray(flags, end))
      const fix = fixes.find((f) => text.includes(f.text))
      const max = 2 ** (r.n - 1)
      if (fix && r.v[0] - fix.grow >= -max && r.v[1] + fix.grow < max) {
        writeRect(b, p + 2, r.n, [r.v[0] - fix.grow, r.v[1] + fix.grow, r.v[2], r.v[3]])
        b[flags] &= ~0x40 // WordWrap
        hit = true
      }
    }
    p += len
  }
  return hit ? b : swf
}

/**
 * Serves `url` (a piece of it) patched by `fixes` to Ruffle, which fetches movies through window.fetch.
 * Returns a function that undoes the hook.
 */
export function patchSwfFetch(url: string, fixes: TextFix[]): () => void {
  const prev = window.fetch
  const hook: typeof window.fetch = async (input, init) => {
    const href = String(input instanceof Request ? input.url : input)
    const res = await prev(input, init)
    if (!href.includes(url) || !res.ok) return res
    const swf = await fixTextFields(new Uint8Array(await res.arrayBuffer()), fixes)
    return new Response(swf.slice(), { status: 200, headers: { 'Content-Type': 'application/x-shockwave-flash' } })
  }
  window.fetch = hook
  return () => {
    if (window.fetch === hook) window.fetch = prev
  }
}
