import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import { patchRuffleAudio } from './patch-ruffle-audio.mjs'

// Ruffle 0.6's fallback is labeled MVP, but has sign-extension instructions.
// Safari 14.0 (iOS 14.0–14.4 / macOS 11.0) needs their equivalent shift form.
const name = '72a20ef1c0b8ceb37720.wasm'
const expected = 'adabc1696a2f1f95715ede6be0ac00a73364895c8e599039e60fef3b2f52efa4'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const ruffle = resolve('node_modules/@ruffle-rs/ruffle')
const metadata = JSON.parse(await fs.readFile(resolve(ruffle, 'package.json'), 'utf8'))
const loader = patchRuffleAudio(await fs.readFile(resolve(ruffle, 'ruffle.js')), metadata.version)
const source = await fs.readFile(resolve(ruffle, name))
if (hash(source) !== expected) throw new Error('Ruffle fallback changed. Audit its Wasm baseline before updating the pinned compatibility recipe.')
const directory = resolve('out/ruffle-safari14')
await fs.mkdir(directory, { recursive: true })
const cached = resolve(directory, name)
const manifest = resolve(directory, 'manifest.json')
let lowered
try {
  const record = JSON.parse(await fs.readFile(manifest, 'utf8'))
  const bytes = await fs.readFile(cached)
  if (record.source === expected && record.binaryen === '123.0.0' && record.output === hash(bytes)) lowered = bytes
} catch { /* First build or an incomplete cache is regenerated. */ }
if (!lowered) {
  const { default: binaryen } = await import('binaryen')
  const module = binaryen.readBinary(source)
  try {
    module.setFeatures(binaryen.Features.MutableGlobals | binaryen.Features.SignExt)
    if (!module.validate()) throw new Error('Ruffle input failed Wasm validation.')
    module.runPasses(['signext-lowering'])
    module.setFeatures(binaryen.Features.MutableGlobals)
    // Validation with SignExt disabled checks instructions, not just metadata.
    if (!module.validate()) throw new Error('Ruffle output exceeds the Safari 14.0 Wasm baseline.')
    lowered = module.emitBinary()
  } finally { module.dispose() }
  await fs.writeFile(cached, lowered)
  await fs.writeFile(manifest, JSON.stringify({ source: expected, binaryen: '123.0.0', features: ['mutable-globals'], output: hash(lowered) }, null, 2) + '\n')
}
const destination = process.argv[2]
if (!destination) throw new Error('Specify the copied Ruffle directory.')
await fs.copyFile(cached, resolve(destination, name))
await fs.writeFile(resolve(destination, 'ruffle.js'), loader)
console.log('Ruffle fallback validated for Safari 14.0.')
