import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { growMinutes, moodDecayPerMinute, pokeMoodGain } from '../../src/renderer/pet/mood.ts'

test('face poke mood follows classic bands (#131)', () => {
  assert.equal(pokeMoodGain(1000), 5)
  assert.equal(pokeMoodGain(900), 5)
  assert.equal(pokeMoodGain(899), 10)
  assert.equal(pokeMoodGain(800), 10)
  assert.equal(pokeMoodGain(799), 30)
  assert.equal(pokeMoodGain(500), 30)
  assert.equal(pokeMoodGain(499), 50)
  assert.equal(pokeMoodGain(200), 50)
  assert.equal(pokeMoodGain(199), 70)
  assert.equal(pokeMoodGain(0), 70)
})

test('mood decays 1/min idle and 2/min while busy (#131)', () => {
  assert.equal(moodDecayPerMinute(false), 1)
  assert.equal(moodDecayPerMinute(true), 2)
})

test('a hungry or dirty pet stops growing', () => {
  const rates = { mood: 1, hunger: 2, clean: 2 }
  assert.equal(growMinutes(60, { mood: 900, hunger: 900, clean: 900 }, rates), 60)
  assert.equal(growMinutes(60, { mood: 900, hunger: 0, clean: 900 }, rates), 0)
  assert.equal(growMinutes(60, { mood: 900, hunger: 900, clean: 0 }, rates), 0)
  assert.equal(growMinutes(60, { mood: 0, hunger: 900, clean: 900 }, rates), 0)
  // It still grows the minutes the stat lasted, then stops.
  assert.equal(growMinutes(60, { mood: 900, hunger: 30, clean: 900 }, rates), 15)
  assert.equal(growMinutes(60, { mood: 900, hunger: 900, clean: 9 }, rates), 4.5)
  assert.equal(growMinutes(5, { mood: 900, hunger: 900, clean: 900 }, rates), 5)
})

test('the growth tick budgets the same hunger and cleanliness it drains', () => {
  const pet = readFileSync(new URL('../../src/renderer/pet/pet.ts', import.meta.url), 'utf8')
  assert.match(pet, /const hungerRate = rand\(2, 3\) \+ extra/)
  assert.match(pet, /const cleanRate = rand\(2, 3\) \+ extra/)
  assert.match(pet, /growMinutes\(dt, info, \{ mood: moodRate, hunger: hungerRate, clean: cleanRate \}\)/)
  assert.match(pet, /setInfo\('hunger', Math\.max\(info\.hunger - hungerRate \* dt, 0\)\)/)
  assert.match(pet, /setInfo\('clean', Math\.max\(info\.clean - cleanRate \* dt, 0\)\)/)
  // A starving duck must not keep levelling: the base rate reads zero too.
  const store = readFileSync(new URL('../../src/renderer/pet/store.ts', import.meta.url), 'utf8')
  assert.match(store, /if \(info\.mood <= 0 \|\| info\.hunger <= 0 \|\| info\.clean <= 0\) return 0/)
})

