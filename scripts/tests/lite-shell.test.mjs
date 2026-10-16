import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  MANIFEST, NO_CONTENT, bundledContent, contentVersion, downloadTo, fetchIndex, installPack, installedLayers, lookup, mirrored, pickFullPack, sha256, writeZip,
} from '../../src/main/content-pack.ts'
import { firstRunFlow } from '../../src/renderer/first-run-flow.ts'

// Lite installers (#28): no resources/pet in the program, content comes from a full pack on first run.
const dir = () => mkdtempSync(join(tmpdir(), 'qqpet-lite-'))

function fullPack(version, files = { 'pet/a.swf': 'AAA' }, extra = {}) {
  const data = Object.fromEntries(Object.entries(files).map(([p, t]) => [p, Buffer.from(t)]))
  const m = { id: 'core', version, minShell: '0.6.8', files: Object.entries(data).map(([path, b]) => ({ path, size: b.length, sha256: sha256(b) })), ...extra }
  const all = { [MANIFEST]: Buffer.from(JSON.stringify(m)), ...data }
  const file = join(dir(), `QQPet-content-${version}.qqpetpack`)
  writeZip(file, Object.keys(all), (n) => all[n])
  return file
}

const entry = (version, extra = {}) => ({ id: 'core', version, minShell: '0.6.8', name: `QQPet-content-${version}.qqpetpack`, url: `https://github.com/o/r/releases/download/v${version}/QQPet-content-${version}.qqpetpack`, size: 10, sha256: 'a'.repeat(64), ...extra })

/** A fetch answering `routes` (url -> bytes or index object); bodies stream in `chunk`-byte pieces. */
function fakeFetch(routes, { chunk = 4, status = 200, log = [] } = {}) {
  return async (url, init) => {
    log.push(url)
    const r = routes[url]
    if (r === undefined) return new Response('nope', { status: 404 })
    if (r instanceof Error) throw r
    if (!(r instanceof Uint8Array)) return Response.json(r, { status })
    let at = 0
    const body = new ReadableStream({
      pull(c) {
        if (init?.signal?.aborted) return c.error(init.signal.reason)
        if (at >= r.length) return c.close()
        c.enqueue(r.subarray(at, (at += chunk)))
      },
    })
    return new Response(body, { status })
  }
}

test('a program without resources/pet is lite: content starts at nothing and needs a pack', () => {
  const root = dir()
  assert.equal(bundledContent(root, '0.7.0'), null)
  mkdirSync(join(root, 'pet'))
  assert.equal(bundledContent(root, '0.7.0'), '0.7.0')
  const packs = dir()
  assert.deepEqual(installedLayers(packs, NO_CONTENT, '0.7.0'), [])
  assert.equal(contentVersion([], NO_CONTENT), NO_CONTENT)
})

test('a full pack installs on a lite program and serves its files; an incremental one is refused', () => {
  const packs = dir()
  assert.throws(() => installPack(fullPack('0.7.1', { 'pet/b.swf': 'B' }, { base: '0.7.0' }), packs, NO_CONTENT, '0.7.0'), /增量包/)
  // An older full pack than the program is fine: there is nothing below it (the v0.6.9 pack on a v0.7.0 lite program).
  assert.equal(installPack(fullPack('0.6.9'), packs, NO_CONTENT, '0.7.0').version, '0.6.9')
  const layers = installedLayers(packs, NO_CONTENT, '0.7.0')
  assert.equal(contentVersion(layers, NO_CONTENT), '0.6.9')
  assert.equal(readFileSync(lookup(layers, '/missing-bundle', 'pet/a.swf'), 'utf8'), 'AAA')
  // Upgrading the lite program keeps the content; a full program's own newer bundle still wins.
  assert.equal(installedLayers(packs, NO_CONTENT, '0.7.3').length, 1)
  assert.equal(installedLayers(packs, '0.7.0', '0.7.0').length, 0)
})

test('the first run picks the newest full pack this program can take', () => {
  const index = { schema: 1, packs: [entry('0.7.0', { base: '0.6.9' }), entry('0.6.9'), entry('0.7.0'), entry('0.7.1', { minShell: '0.7.1' })] }
  assert.equal(pickFullPack(index, NO_CONTENT, '0.7.0').version, '0.7.0')
  assert.equal(pickFullPack(index, NO_CONTENT, '0.7.1').version, '0.7.1')
  assert.match(pickFullPack({ schema: 1, packs: [entry('0.7.1', { minShell: '0.7.1' })] }, NO_CONTENT, '0.7.0'), /需要 v0\.7\.1 或更新的程序/)
  assert.match(pickFullPack({ schema: 1, packs: [entry('0.7.0', { base: '0.6.9' })] }, NO_CONTENT, '0.7.0'), /没有完整内容包/)
})

test('a mirror is a prefix in front of the GitHub URL', () => {
  const u = 'https://github.com/o/r/releases/latest/download/packs.json'
  assert.equal(mirrored(u), u)
  assert.equal(mirrored(u, '  '), u)
  assert.equal(mirrored(u, 'https://ghfast.top'), `https://ghfast.top/${u}`)
  assert.equal(mirrored(u, 'https://ghfast.top///'), `https://ghfast.top/${u}`)
  assert.throws(() => mirrored(u, 'ghfast.top'), /http/)
})

test('packs.json errors say what went wrong', async () => {
  await assert.rejects(fetchIndex(fakeFetch({}), 'x'), /HTTP 404/)
  await assert.rejects(fetchIndex(fakeFetch({ x: { nope: 1 } }), 'x'), /格式/)
  await assert.rejects(fetchIndex(fakeFetch({ x: new TypeError('net::ERR_NAME_NOT_RESOLVED') }), 'x'), /连不上下载地址.*ERR_NAME_NOT_RESOLVED/)
})

test('a download streams to disk with progress and is checked against packs.json', async () => {
  const data = Buffer.from('0123456789abcdef'.repeat(64))
  const e = entry('0.7.0', { size: data.length, sha256: sha256(data) })
  const file = join(dir(), 'p.qqpetpack')
  const seen = []
  const log = []
  await downloadTo(fakeFetch({ [`https://m.example/${e.url}`]: data }, { chunk: 100, log }), e, file, { mirror: 'https://m.example/', onProgress: (p) => seen.push(p) })
  assert.deepEqual(readFileSync(file), data)
  assert.deepEqual(log, [`https://m.example/${e.url}`])
  assert.deepEqual(seen.at(-1), { received: data.length, total: data.length })
  assert.ok(seen.every((p, i) => i === 0 || p.received >= seen[i - 1].received))
})

test('a bad download leaves no file behind and says why', async () => {
  const data = Buffer.from('payload')
  const file = join(dir(), 'p.qqpetpack')
  const cases = [
    [{ size: data.length, sha256: 'b'.repeat(64) }, data, /校验失败/],
    [{ size: data.length + 5, sha256: sha256(data) }, data, /不完整/],
    [{ size: 3, sha256: sha256(data) }, data, /比预期大/],
  ]
  for (const [extra, body, why] of cases) {
    const e = entry('0.7.0', extra)
    await assert.rejects(downloadTo(fakeFetch({ [e.url]: body }), e, file), why)
    assert.equal(existsSync(file), false)
  }
  const e = entry('0.7.0', { size: data.length, sha256: sha256(data) })
  await assert.rejects(downloadTo(fakeFetch({}), e, file), /HTTP 404/)
  assert.equal(existsSync(file), false)
})

test('a stalled download is cut off instead of hanging', async () => {
  const e = entry('0.7.0', { size: 100, sha256: 'a'.repeat(64) })
  const file = join(dir(), 'p.qqpetpack')
  const stuck = async (_url, init) =>
    new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); init.signal.addEventListener('abort', () => c.error(init.signal.reason)) } }))
  await assert.rejects(downloadTo(stuck, e, file, { stallMs: 50 }), /没有进度/)
  assert.equal(existsSync(file), false)
})

function fakeApi(over = {}) {
  const calls = []
  let progress
  const api = {
    findFull: async (m) => (calls.push(['findFull', m]), { version: '0.7.0', size: 100 }),
    download: async (m) => {
      calls.push(['download', m])
      progress({ received: 40, total: 100 })
      progress({ received: 100, total: 100 })
      return '0.7.0'
    },
    importPack: async () => (calls.push(['import']), '0.6.9'),
    onProgress: (l) => (progress = l),
    relaunch: () => calls.push(['relaunch']),
    ...over,
  }
  return { api, calls }
}

test('first run: download shows progress, installs, then relaunches into the pet', async () => {
  const { api, calls } = fakeApi()
  const states = []
  const flow = firstRunFlow(api, (s) => states.push(s), 0)
  await flow.download('https://m.example/')
  await new Promise((r) => setTimeout(r, 5))
  assert.deepEqual(states.map((s) => s.kind), ['idle', 'finding', 'downloading', 'downloading', 'installing', 'done'])
  assert.deepEqual(states[3], { kind: 'downloading', version: '0.7.0', received: 40, total: 100 })
  assert.deepEqual(calls, [['findFull', 'https://m.example/'], ['download', 'https://m.example/'], ['relaunch']])
})

test('first run: a failure shows why and the same button retries', async () => {
  let fail = true
  const { api, calls } = fakeApi({
    findFull: async () => {
      if (fail) throw new Error("Error invoking remote method 'pack:find-full': Error: 获取内容包列表失败：HTTP 503")
      return { version: '0.7.0', size: 100 }
    },
  })
  const states = []
  const flow = firstRunFlow(api, (s) => states.push(s), 0)
  await flow.download()
  assert.deepEqual(states.at(-1), { kind: 'error', message: '获取内容包列表失败：HTTP 503' })
  fail = false
  await flow.download()
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(states.at(-1).kind, 'done')
  assert.deepEqual(calls.at(-1), ['relaunch'])
})

test('first run: importing a local pack relaunches; cancelling the picker goes back; double clicks run once', async () => {
  let picked = null
  const { api, calls } = fakeApi({ importPack: async () => (calls.push(['import']), picked) })
  const states = []
  const flow = firstRunFlow(api, (s) => states.push(s), 0)
  await flow.importPack()
  assert.equal(states.at(-1).kind, 'idle')
  picked = '0.6.9'
  await Promise.all([flow.importPack(), flow.importPack(), flow.download()])
  await new Promise((r) => setTimeout(r, 5))
  assert.deepEqual(calls.filter((c) => c[0] === 'import').length, 2)
  assert.ok(!calls.some((c) => c[0] === 'findFull'))
  assert.deepEqual(states.at(-1), { kind: 'done', version: '0.6.9' })
})
