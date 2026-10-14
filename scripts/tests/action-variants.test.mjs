import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { ACTIONS, route, variant, walkUrl } from '../../src/renderer/pet/router.ts'

const has = (url) => existsSync(new URL(`../../resources/${url}`, import.meta.url))
const STAGES = ['Egg', 'Kid', 'Adult']

test('every variant clip listed in ACTIONS exists on disk', () => {
  for (const [sex, data] of Object.entries(ACTIONS)) {
    for (const [stage, keys] of Object.entries(data.variants)) {
      for (const [key, list] of Object.entries(keys)) {
        assert.ok(list.length, `${sex}/${stage}/${key}`)
        for (const clip of list) assert.ok(has(`pet/Action/${sex}/${stage}/${clip}.swf`), `${sex}/${stage}/${clip}`)
      }
    }
  }
})

test('numbered play counts match the files on disk for both sexes', () => {
  for (const [sex, { play }] of Object.entries(ACTIONS)) {
    const dirs = { egg: `pet/Action/${sex}/Egg/play`, kid: `pet/Action/${sex}/Kid/play`, peaceful: `pet/Action/${sex}/Adult/peaceful/play` }
    for (const [k, dir] of Object.entries(dirs)) {
      for (let i = 1; i <= play[k]; i++) assert.ok(has(`${dir}/P${i}.swf`), `${dir}/P${i}.swf`)
      assert.ok(!has(`${dir}/P${play[k] + 1}.swf`), `${dir} has more than ${play[k]} plays`)
    }
  }
})

test('variant picks by index and returns null without variants', () => {
  assert.equal(variant('GG', 'Kid', 'dirty', () => 1), 'lead/dirty20110805')
  assert.equal(variant('GG', 'Kid', 'poor', () => 0), 'Poor')
  assert.equal(variant('MM', 'Kid', 'dirty'), null)
  assert.equal(variant('GG', 'Adult', 'drag'), null)
})

test('walk URLs exist for every sex/stage/direction, MM keeps the single gait', () => {
  for (const sex of ['GG', 'MM']) {
    for (const stage of STAGES) {
      for (const dir of ['left', 'right']) {
        for (let i = 0; i < 20; i++) assert.ok(has(walkUrl(sex, stage, dir)), walkUrl(sex, stage, dir))
        if (sex === 'MM') assert.equal(walkUrl(sex, stage, dir), `pet/Action/MM/${stage}/walk/walk_${dir}.swf`)
      }
    }
  }
})

test('variant-bearing actions resolve to an existing clip', () => {
  const actions = ['dirty', 'poor', 'drag', 'play']
  for (const sex of ['GG', 'MM']) {
    for (const stage of STAGES) {
      for (const mood of ['happy', 'peaceful', 'upset', 'sad']) {
        for (const a of actions) {
          for (let i = 0; i < 10; i++) {
            const { url } = route(sex, stage, a, mood)
            // Adult never routes dirty (leadClip falls back to speak).
            if (a === 'dirty' && stage === 'Adult') continue
            if (['dirty', 'poor', 'drag', 'play'].includes(a)) assert.ok(has(url), url)
          }
        }
      }
    }
  }
})
