import assert from 'node:assert/strict'
import test from 'node:test'
import { gameRewards } from '../../src/ios/game-rewards.ts'
import { IOSRPC } from '../../src/ios/rpc.ts'
import { IOSSaveWriter } from '../../src/ios/save-writer.ts'

test('aborting native HTTP cancels its task and late replies do not settle another request', async () => {
  const posts = []
  const rpc = new IOSRPC((request) => posts.push(request))
  const controller = new AbortController()
  const first = rpc.request('http', { url: 'http://localhost/v1/models' }, { signal: controller.signal })
  controller.abort()
  await assert.rejects(first, { name: 'AbortError' })
  assert.deepEqual(posts[1], { page: rpc.page, id: 0, op: 'cancel', args: { requestId: posts[0].id } })
  const second = rpc.request('safeArea')
  rpc.resolve(posts[0].id, 'late', null, rpc.page)
  rpc.resolve(posts[2].id, { top: 20 }, null, rpc.page)
  assert.deepEqual(await second, { top: 20 })
  rpc.resolve(posts[2].id, 'duplicate', null, rpc.page)
  rpc.dispose()
})

test('a signal already aborted never starts a native request; transport failure cleans up', async () => {
  let calls = 0
  const rpc = new IOSRPC(() => { calls++; throw new Error('No WK host') })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(rpc.request('http', {}, { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(calls, 0)
  await assert.rejects(rpc.request('bootstrap'), /No WK host/)
  assert.equal(calls, 1)
  rpc.resolve(1, 'late', null, rpc.page)
  rpc.dispose()
})

test('page disposal cancels network and foreground UI, while queued file writes finish', async () => {
  const posts = []
  const rpc = new IOSRPC((request) => posts.push(request))
  const network = rpc.request('http')
  const save = rpc.request('writeSave')
  const editor = rpc.request('editText', {}, { timeout: 0 })
  rpc.dispose()
  await assert.rejects(network, /page has closed/)
  await assert.rejects(save, /page has closed/)
  await assert.rejects(editor, /page has closed/)
  assert.deepEqual(posts.filter((request) => request.op === 'cancel').map((request) => request.args.requestId), [1, 3])
  await assert.rejects(rpc.request('bootstrap'), /page has closed/)
})

test('a late native reply from the previous page cannot resolve reused request IDs after reload', async () => {
  const oldPosts = []
  const oldPage = new IOSRPC((request) => oldPosts.push(request), 'old-page')
  const oldRequest = oldPage.request('http')
  oldPage.dispose()
  await assert.rejects(oldRequest, /page has closed/)
  const newPosts = []
  const newPage = new IOSRPC((request) => newPosts.push(request), 'new-page')
  const current = newPage.request('bootstrap')
  let settled = false
  void current.then(() => { settled = true })
  assert.equal(newPosts[0].id, oldPosts[0].id)
  newPage.resolve(oldPosts[0].id, 'old response', null, oldPosts[0].page)
  await Promise.resolve()
  assert.equal(settled, false)
  newPage.resolve(newPosts[0].id, 'current response', null, newPosts[0].page)
  assert.equal(await current, 'current response')
  newPage.dispose()
})

test('native writes and save replacement are serialized; old generation snapshots cannot overwrite the new pet', async () => {
  const events = []
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const writer = new IOSSaveWriter('old', {
    async write(generation, text) { events.push(['write', generation, text]); if (text === 'first') await gate },
    async replace(generation, text, backup) { events.push(['replace', generation, text, backup]); return { generation: 'new' } },
  })
  const first = writer.write('first')
  const replacement = writer.replace('imported', true)
  const stale = writer.write('old renderer snapshot')
  const rejectedStale = assert.rejects(stale, /previous save session/)
  await Promise.resolve()
  assert.deepEqual(events, [['write', 'old', 'first']])
  release()
  await first
  await replacement
  await rejectedStale
  assert.equal(writer.generation, 'new')
  assert.deepEqual(events, [['write', 'old', 'first'], ['replace', 'old', 'imported', true]])
  await writer.write('current renderer snapshot')
  await writer.flush()
  assert.deepEqual(events.at(-1), ['write', 'new', 'current renderer snapshot'])
})

test('native save failure remains visible at the flush barrier until a complete newer snapshot is acknowledged', async () => {
  let fail = true
  const writer = new IOSSaveWriter('session', {
    async write() { if (fail) throw new Error('Disk full') },
    async replace() { throw new Error('Not used') },
  })
  await assert.rejects(writer.write('snapshot'), /Disk full/)
  await assert.rejects(writer.flush(), /Disk full/)
  fail = false
  await writer.write('new complete snapshot')
  await writer.flush()
})

test('game rewards arriving during bootstrap wait for the save and deduplicate concurrent notifications', async () => {
  let finishBootstrap
  const ready = new Promise((resolve) => { finishBootstrap = resolve })
  let generation
  const minutes = []
  const accept = gameRewards(() => ready, () => generation, (value) => minutes.push(value))
  const event = { sessionId: 'session', generation: 'current', minutes: 3 }
  const first = accept(event)
  const duplicate = accept(event)
  await Promise.resolve()
  assert.deepEqual(minutes, [])
  generation = 'current'
  finishBootstrap()
  await Promise.all([first, duplicate])
  assert.deepEqual(minutes, [3])
})

test('a replaced-save game event is rejected before consuming its session identity', async () => {
  let finishBootstrap
  const ready = new Promise((resolve) => { finishBootstrap = resolve })
  let generation = 'old'
  const minutes = []
  const accept = gameRewards(() => ready, () => generation, (value) => minutes.push(value))
  const stale = accept({ sessionId: 'session', generation: 'old', minutes: 2 })
  generation = 'new'
  finishBootstrap()
  await stale
  assert.deepEqual(minutes, [])
  await accept({ sessionId: 'session', generation: 'new', minutes: 4 })
  await accept({ sessionId: 'session', generation: 'new', minutes: 4 })
  assert.deepEqual(minutes, [4])
})
