import assert from 'node:assert/strict'
import test from 'node:test'
import { cropsFromXml, growStage, runFarmCare } from '../../src/renderer/pet/farm-care.ts'
import { parseCare } from '../../src/renderer/pet/care.ts'

const crops = {
  RadishSeed: { name: '白萝卜', seed: 'RadishSeed', time: 100, experience: 10, yield: 24, price: 18 },
  TomatoSeed: { name: '西红柿', seed: 'TomatoSeed', time: 200, experience: 18, yield: 26, price: 24 },
}

test('care defaults: farm and fish auto off', () => {
  const c = parseCare('')
  assert.equal(c.farm, false)
  assert.equal(c.fish, false)
  assert.equal(parseCare(JSON.stringify({ farm: true, fish: true })).farm, true)
})

test('growStage: unripe then ripe by time', () => {
  const land = { farmland: 'FarmlandS', crop: 'RadishSeed', time: 1000 }
  assert.equal(growStage(land, crops, 1040), 2)
  assert.equal(growStage(land, crops, 1100), 5)
  assert.equal(growStage({ ...land, harvest: 'xx' }, crops, 1100), 6)
})

test('runFarmCare: harvest ripe, clear, water/weed, plant from bag', () => {
  const now = 10_000
  const user = {
    experience: '1',
    farmland: [
      { farmland: 'FarmlandS', crop: 'RadishSeed', time: now - 200, grass: 1, worm: 1 }, // ripe + pests (pests cleared after harvest)
      { farmland: 'FarmlandG', crop: 'TomatoSeed', time: now - 10 }, // growing, dry
      { farmland: 'FarmlandS' }, // empty
      { farmland: 'Wasteland' },
      { farmland: 'FarmlandS', crop: 'RadishSeed', time: now - 200, harvest: 'xx', yield: 20 }, // wilted
    ],
    burden: [{ Items: 'TomatoSeed', number: 2 }, { Items: 'Hoe', number: 1 }],
    warehouse: [],
  }
  const r = runFarmCare(user, crops, now)
  assert.equal(r.harvested, 1)
  assert.ok(r.fruits >= 1)
  assert.equal(r.cleared, 2) // harvested plot + prior wilted
  assert.equal(r.cared, 1) // dry tomato plot watered
  assert.equal(r.planted, 2) // empty + cleared harvested plot (wasteland skipped); 2 tomato seeds
  assert.equal(r.user.burden.find((b) => b.Items === 'TomatoSeed'), undefined)
  assert.equal(r.user.warehouse[0].fruit, 'RadishSeed')
  assert.equal(r.user.warehouse[0].number, r.fruits)
  // Dry growing plot still has tomato, now watered
  const growing = r.user.farmland[1]
  assert.equal(growing.crop, 'TomatoSeed')
  assert.equal(growing.farmland, 'FarmlandS')
  // Empty and cleared plots got tomato
  assert.equal(r.user.farmland.filter((l) => l.crop === 'TomatoSeed' && l.time === now).length, 2)
})

test('runFarmCare: no-op when nothing to do', () => {
  const r = runFarmCare({ experience: '1', farmland: [{ farmland: 'Wasteland' }], burden: [], warehouse: [] }, crops, 1)
  assert.deepEqual([r.harvested, r.cared, r.cleared, r.planted], [0, 0, 0, 0])
})

test('cropsFromXml reads seed table', () => {
  const xml = `<?xml version="1.0"?><data><items name="草莓" seed="StrawberrySeed" crop="Strawberry" time="86400" experience="26" yield="24" price="18"></items></data>`
  const t = cropsFromXml(xml)
  assert.equal(t.StrawberrySeed.time, 86400)
  assert.equal(t.StrawberrySeed.name, '草莓')
})
