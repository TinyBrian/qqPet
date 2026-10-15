// Offline self-test for the friend-LAN layer: three pet nodes in one process.
// Real UDP broadcast (loopback) and real TCP links; no Electron, no game.
// Covers: mutual discovery, the direct link, message delivery, graceful
// goodbye, and the missed-heartbeat timeout.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LanNode } from '../../src/main/lan.ts'
import { VisitQueue } from '../../src/main/visit-queue.ts'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The suite shares the real UDP port with any pet app actually running on this
// machine (the dev pet broadcasts too). Assert only on the fake pets' own comings
// and goings, never on ambient traffic.
const OWN = new Set(['甲', '乙', '丙', '丁', '戊'])

const mk = (log, id, name) =>
  new LanNode(
    { id, name, host: `${name}家`, sex: 'GG', level: 1 },
    {
      online: (p) => OWN.has(p.name) && log.push(`+${p.name}`),
      offline: (p) => OWN.has(p.name) && log.push(`-${p.name}`),
      message: (_from, body) => log.push(`m:${String(body)}`),
    },
    // Fast heartbeats keep the suite in seconds with generous margins.
    { helloMs: 500, timeoutMs: 2500 },
  )

test('pets discover, link, deliver, and go home', async () => {
  const a = [],
    b = [],
    c = []
  const A = mk(a, 'id-甲', '甲')
  const B = mk(b, 'id-乙', '乙')
  const C = mk(c, 'id-丙', '丙')
  await A.start()
  await B.start()
  await C.start()
  try {
    await sleep(1500)
    assert.deepEqual([...a].sort(), ['+丙', '+乙'].sort())
    assert.deepEqual([...b].sort(), ['+丙', '+甲'].sort())
    assert.deepEqual([...c].sort(), ['+乙', '+甲'].sort())

    // The TCP link dials in the background; retry until it carries the line.
    for (let i = 0; i < 25 && !b.includes('m:你好乙') && !c.includes('m:你好丙'); i++) {
      A.send('id-乙', '你好乙')
      A.send('id-丙', '你好丙')
      await sleep(200)
    }
    assert.ok(b.includes('m:你好乙'), `乙 never got the message: ${b}`)
    assert.ok(c.includes('m:你好丙'), `丙 never got the message: ${c}`)

    // Graceful goodbye: everyone hears 丙 leave at once.
    C.stop()
    await sleep(1000)
    assert.ok(a.includes('-丙'), `甲 missed 丙's goodbye: ${a}`)
    assert.ok(b.includes('-丙'), `乙 missed 丙's goodbye: ${b}`)
  } finally {
    A.stop()
    B.stop()
  }
})

test('a crashed pet is missed within the timeout', async () => {
  const a = [],
    d = []
  const A = mk(a, 'id-丁', '丁')
  const D = mk(d, 'id-戊', '戊')
  await A.start()
  await D.start()
  try {
    await sleep(1500)
    assert.ok(a.includes('+戊'), `丁 never saw 戊: ${a}`)
    // Pull the plug without a goodbye, as a crash would.
    clearInterval(D.helloTimer)
    clearInterval(D.sweepTimer)
    for (const s of D.links.values()) s.destroy()
    D.udp.close()
    D.server.close()
    a.length = 0
    // The sweep ticks every 500ms and drops peers silent for 2.5s: waiting
    // three extra sweeps leaves a wide margin over the timeout.
    await sleep(4500)
    assert.deepEqual(a, ['-戊'])
  } finally {
    A.stop()
  }
})

test('queued visits survive a restart and flush per peer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qqpet-queue'))
  const q = new VisitQueue(dir)
  q.add('peer-a', { t: 'visit', text: '晚上开黑' })
  q.add('peer-b', { t: 'visit', text: '来玩呀' })
  // A whole new instance reading the same userData sees the same queue.
  const reborn = new VisitQueue(dir)
  assert.deepEqual(reborn.take('peer-a'), [{ t: 'visit', text: '晚上开黑' }])
  assert.deepEqual(reborn.take('peer-a'), [], 'a taken delivery must not repeat')
  assert.deepEqual(reborn.take('peer-b'), [{ t: 'visit', text: '来玩呀' }])
})
