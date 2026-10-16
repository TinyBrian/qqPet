import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Lite installers (#28) are packaged from the same build output with a second electron-builder config.
test('the lite builder config is the full one minus resources/pet, under its own artifact names', () => {
  const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
  const full = read('electron-builder.yml')
  const lite = read('electron-builder.lite.yml')
  assert.deepEqual(full.filter((l) => !lite.includes(l)), ['      - pet/**'])
  assert.deepEqual(lite.filter((l) => !full.includes(l)), ['artifactName: QQPet-Lite-${version}-${arch}.${ext}', '  artifactName: QQPet-Lite-Setup-${version}-${arch}.${ext}'])
  const ci = readFileSync(new URL('../../.github/workflows/build.yml', import.meta.url), 'utf8')
  assert.match(ci, /electron-builder --config electron-builder\.lite\.yml --publish never/)
})
