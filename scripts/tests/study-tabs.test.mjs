import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const jobs = readFileSync(new URL('../../src/renderer/pet/jobs.ts', import.meta.url), 'utf8')
const control = readFileSync(new URL('../../src/renderer/ui/control.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../src/renderer/ui/css/control.css', import.meta.url), 'utf8')

// jobs.ts pulls in the whole pet at import time; the school helpers need none of it.
function schoolModule() {
  const context = {
    save: { settings: {}, studyInfo: {}, petComputedlInfo: { level: 1 } },
    info: { health: 5, mood: 500 },
    activity: () => null,
    goodOf: () => ({ object: '语文' }),
    attrs: () => '',
  }
  const source = jobs
    .replace(/^import .*$/gm, '')
    .replace(/^export \{.*\}$/gm, '')
    .replace(/^export (?=(?:async )?(?:function|const|let|var|class|type|interface))/gm, '')
  runInNewContext(`${stripTypeScriptTypes(source)}\nthis.schoolOf = schoolOf; this.majorSchool = majorSchool; this.STUDY_SCHOOLS = STUDY_SCHOOLS`, context)
  return context
}

test('a lesson names its school by its id prefix', () => {
  const app = schoolModule()
  assert.equal(app.schoolOf({ id: 'zx-chinese' }), 'zx')
  assert.equal(app.schoolOf({ id: 'xwzj-wushu' }), 'xwzj')
  assert.deepEqual(
    Array.from(app.STUDY_SCHOOLS, ([key, label]) => `${key}:${label}`),
    ['xx:小学', 'zx:中学', 'dx:大学', 'yjs:研究生', 'xwzj:学无止境'],
  )
})

test('the study panel opens on the school most subjects are at', () => {
  const app = schoolModule()
  assert.equal(app.majorSchool(['xx', 'xx', 'xx', 'zx']), 'xx')
  assert.equal(app.majorSchool(['zx', 'zx', 'zx', 'xx']), 'zx')
  assert.equal(app.majorSchool(['dx']), 'dx')
  // A tie keeps the earlier school, so the panel does not jump around.
  assert.equal(app.majorSchool(['zx', 'xx']), 'xx')
  assert.equal(app.majorSchool([]), 'xx')
})

test('the study panel filters by school through its top tab row', () => {
  assert.match(control, /tabs\?: \(\) => \{ label: string; on: boolean; run: \(\) => void \}\[\]/)
  assert.match(control, /list: \(page\) => pageOf\(studyGoods\(\)\.filter\(\(g\) => schoolOf\(g\) === studyTab\), page, PAGE\)/)
  assert.match(control, /tabs: \(\) => STUDY_SCHOOLS\.map\(\(\[key, label\]\) => \(\{ label, on: key === studyTab, run: \(\) => pickSchool\(panel, key\) \}\)\)/)
  assert.match(control, /div\('goodTabs fc'/)
  assert.match(control, /goodTab\$\{tab\.on \? ' on' : ''\}/)
  const tab = css.slice(css.indexOf('.ui-control .goodTab {'))
  assert.match(tab.slice(0, tab.indexOf('}')), /flex: 1/)
  const on = css.slice(css.indexOf('.ui-control .goodTab.on {'))
  assert.match(on.slice(0, on.indexOf('}')), /background-color: #ff8a1f/)
})
