/**
 * #123: pink-diamond pond super-feed uses refill each VIP day, and a clock rollback
 * must not keep wiping canusecnt on every subsequent settle.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../../src/renderer/pet/fishing.ts', import.meta.url), 'utf8')

function dayStart(nowSec) {
  const d = new Date(nowSec * 1000)
  d.setHours(6, 0, 0, 0)
  if (d.getTime() > nowSec * 1000) d.setDate(d.getDate() - 1)
  return d.getTime() / 1000
}

function loadFishing({ nowSec, pinkDiamond = true, PDiamondLevel = 1, saved }) {
  const state = {
    nowSec,
    info: { pinkDiamond, PDiamondLevel, yb: 100 },
    save: {
      saveJsonData: { fishs: JSON.stringify(saved) },
      gameSaveDatas: { fishing_harvestfish: 0, yyds: 0 },
    },
  }
  const body = stripTypeScriptTypes(source)
    .replace(/^import .*$/gm, '')
    .replace(/^export /gm, '')
    .replace(/Math\.floor\(Date\.now\(\) \/ 1000\)/g, 'state.nowSec')
  const context = {
    console,
    Date,
    Math,
    JSON,
    state,
    FRIES: [{ fryid: 1, name: 'a', interval: 3600, price_yb: 10, sell_price: 20, quantity: 1, avator: 1 }],
    info: state.info,
    save: state.save,
    update: (key, value) => {
      if (key === 'saveJsonData') Object.assign(state.save.saveJsonData, value)
      if (key === 'gameSaveDatas') Object.assign(state.save.gameSaveDatas, value)
    },
    setInfo: (key, value) => {
      state.info[key] = value
    },
    earnYb: (n) => {
      state.info.yb += n
      return n
    },
    windowView: () => {},
  }
  runInNewContext(`${body}\nthis.resetFish = resetFish\nthis.pondState = pondState\n`, context)
  return {
    resetFish: context.resetFish,
    pondState: context.pondState,
    setNow: (t) => {
      state.nowSec = t
    },
  }
}

test('resetFish fills canusecnt for pink diamond', () => {
  const morning = Math.floor(new Date('2026-10-23T10:00:00+08:00').getTime() / 1000)
  const app = loadFishing({
    nowSec: morning,
    pinkDiamond: true,
    PDiamondLevel: 2,
    saved: { PD: { allvipcnt: 0, canusecnt: 0 }, fishs: [] },
  })
  app.resetFish()
  const s = app.pondState()
  assert.equal(s.allvipcnt, 4)
  assert.equal(s.canusecnt, 4)
})

test('crossing 06:00 refills uses even if canusecnt was zero', () => {
  const morning = Math.floor(new Date('2026-10-22T10:00:00+08:00').getTime() / 1000)
  const nextMorning = Math.floor(new Date('2026-10-23T10:00:00+08:00').getTime() / 1000)
  const app = loadFishing({
    nowSec: morning,
    pinkDiamond: true,
    PDiamondLevel: 1,
    saved: { PD: { allvipcnt: 2, canusecnt: 0, day: dayStart(morning) }, fishs: [] },
  })
  assert.equal(app.pondState().canusecnt, 0, 'same VIP day keeps spent uses')
  app.setNow(nextMorning)
  const s = app.pondState()
  assert.equal(s.canusecnt, 2)
  assert.equal(s.allvipcnt, 2)
})

test('clock rollback does not keep wiping refilled uses', () => {
  const morning = Math.floor(new Date('2026-10-23T10:00:00+08:00').getTime() / 1000)
  const app = loadFishing({
    nowSec: morning,
    pinkDiamond: true,
    PDiamondLevel: 1,
    saved: { PD: { allvipcnt: 2, canusecnt: 2, day: dayStart(morning) }, fishs: [] },
  })
  app.pondState()
  app.setNow(morning - 60)
  app.pondState()
  app.setNow(morning)
  app.resetFish()
  assert.equal(app.pondState().canusecnt, 2)
  assert.equal(app.pondState().canusecnt, 2)
})
