import assert from 'node:assert/strict'
import test from 'node:test'
import { bestJob, cheapest, parseCare, pushLog, spend } from '../../src/renderer/pet/care.ts'
import { pinkCost, pinkDays, sweetDays } from '../../src/renderer/pet/diamond.ts'

test('care defaults: caring on, auto-work off, budget 500', () => {
  const c = parseCare('')
  assert.deepEqual([c.heal, c.revive, c.restock, c.exam, c.notify, c.work, c.budget, c.workBelow], [true, true, true, true, true, false, 500, 200])
  const o = parseCare(JSON.stringify({ heal: false, budget: -5, workBelow: 1e12 }))
  assert.deepEqual([o.heal, o.budget, o.workBelow], [false, 0, 1e7])
})

test('budget: resets each day, refuses past the cap or the wallet', () => {
  let r = spend({ day: 1, yb: 450 }, 1, 60, 500, 9999)
  assert.equal(r.ok, false)
  r = spend({ day: 1, yb: 450 }, 2, 60, 500, 9999)
  assert.deepEqual(r, { ok: true, spent: { day: 2, yb: 60 } })
  assert.equal(spend({ day: 2, yb: 0 }, 2, 60, 500, 59).ok, false)
})

test('log: newest first, capped, repeats within a minute folded', () => {
  let log = []
  log = pushLog(log, { t: 100, s: '吃了A' })
  log = pushLog(log, { t: 110, s: '吃了A' })
  log = pushLog(log, { t: 120, s: '吃了A' })
  assert.deepEqual(log, [{ t: 120, s: '吃了A ×3' }])
  log = pushLog(log, { t: 300, s: '吃了A' })
  assert.equal(log.length, 2)
  for (let i = 0; i < 80; i++) log = pushLog(log, { t: 1000 + i * 100, s: `x${i}` })
  assert.equal(log.length, 50)
  assert.equal(log[0].s, 'x79')
})

test('restock picks the best value; jobs by 元宝 per minute among qualified', () => {
  const goods = [{ id: 'a', hunger: 100, price: 5 }, { id: 'b', hunger: 300, price: 10 }, { id: 'c', clean: 900, price: 1 }, { id: 'd', hunger: 50, price: -1 }]
  assert.equal(cheapest(goods, 'hunger').id, 'b')
  assert.equal(cheapest(goods, 'mood'), undefined)
  const jobs = [{ id: 'x', yb: 60, useTime: 60 }, { id: 'y', yb: 200, useTime: 100 }, { id: 'z', yb: 900, useTime: 60 }]
  assert.equal(bestJob(jobs, (j) => j.id !== 'z').id, 'y')
  assert.equal(bestJob(jobs, () => false), undefined)
})

test('钻石 prices follow #75: 粉钻 10/月 (12 months = a year), 贴心宝贝 1颗=3天', () => {
  assert.equal(pinkCost(1), 10)
  assert.equal(pinkCost(12), 120)
  assert.equal(pinkDays(1), 30)
  assert.equal(pinkDays(12), 365)
  assert.equal(pinkDays(13), 395)
  assert.equal(sweetDays(2), 6)
})

test('钻石 in saves: new pets start with 3, older saves get 3, bad values are fixed', async () => {
  const { startSave } = await import('../../src/shared/save-logic.ts')
  const fresh = startSave(null)
  assert.equal(fresh.petInfo.diamond, 3)
  const old = JSON.parse(JSON.stringify(fresh))
  old.havePet = true
  delete old.petInfo.diamond
  assert.equal(startSave(old).petInfo.diamond, 3)
  old.petInfo.diamond = 42
  assert.equal(startSave(JSON.parse(JSON.stringify(old))).petInfo.diamond, 42)
  old.petInfo.diamond = 'x'
  assert.equal(startSave(JSON.parse(JSON.stringify(old))).petInfo.diamond, 3)
})
