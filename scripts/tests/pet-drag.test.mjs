import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { route } from '../../src/renderer/pet/router.ts'

test('drag keeps the stage, sex and adult mood, using an available standing clip', () => {
  for (const sex of ['GG', 'MM']) {
    for (const stage of ['Egg', 'Kid', 'Adult']) {
      for (const mood of ['happy', 'peaceful', 'upset', 'sad']) {
        const target = route(sex, stage, 'drag', mood)
        const expected = `pet/Action/${sex}/${stage}/${stage === 'Adult' ? `${mood}/` : ''}Stand.swf`
        assert.equal(target.url, expected)
        assert.ok(existsSync(new URL(`../../resources/${target.url}`, import.meta.url)), target.url)
      }
    }
  }
})
