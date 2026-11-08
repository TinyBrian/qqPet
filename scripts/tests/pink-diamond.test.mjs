import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ui = (path) => readFileSync(new URL(`../../src/renderer/ui/${path}`, import.meta.url), 'utf8')

test('the tray panel and the 档案 window share one pink diamond dialog', () => {
  const state = ui('state.ts')
  const petinfo = ui('petinfo.ts')
  // One exported entry point, wired to the diamond in both panels.
  assert.match(state, /export function pinkDiamondDialog\(\): void/)
  assert.match(state, /button\('pinkDiamond', pinkDiamondDialog\)/)
  assert.match(petinfo, /import \{[^}]*pinkDiamondDialog[^}]*\} from '\.\/state'/)
  assert.match(petinfo, /button\('pinkDiamond', pinkDiamondDialog\)/)
  // The 档案 window used to draw a plain icon that did nothing on click.
  assert.doesNotMatch(petinfo, /div\('pinkDiamond'\)/)
})

test('both pink diamonds show the pointer cursor', () => {
  const state = ui('css/state.css')
  const petinfo = ui('css/petinfo.css')
  assert.match(state, /\.ui-state \.pinkDiamond \{[^}]*cursor:\s?pointer/)
  assert.match(petinfo, /\.ui-petinfo \.pinkDiamond \{[^}]*cursor:\s?pointer/)
})

test('a pet without pink diamond still shows the grey badge in 档案', () => {
  const petinfo = ui('petinfo.ts')
  // The whole badge used to be hidden for non-members; only the growth numbers are hidden now.
  assert.doesNotMatch(petinfo, /pd\.style\.display/)
  assert.match(petinfo, /pdGrowth\.style\.display = info\.pinkDiamond \? '' : 'none'/)
  // n*.svg is the grey variant, u*.svg the pink one.
  assert.match(petinfo, /\$\{info\.pinkDiamond \? 'u' : 'n'\}/)
})
