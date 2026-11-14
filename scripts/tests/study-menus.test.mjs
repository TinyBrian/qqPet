import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const jobs = readFileSync(new URL('../../src/renderer/pet/jobs.ts', import.meta.url), 'utf8')
const control = readFileSync(new URL('../../src/renderer/ui/control.ts', import.meta.url), 'utf8')

/** lessons needed per school, and the studyInfo the school starts at (as in goods.json). */
const SCHOOLS = { xx: [9, 0], zx: [20, 10], dx: [40, 31], yjs: [95, 72], xwzj: [9999998, 168] }
const KEYS = ['xx', 'zx', 'dx', 'yjs', 'xwzj']

/** A stub of the pet around jobs.ts: enough for the study helpers, nothing else. */
function schoolModule(studyInfo) {
  const context = {
    save: { settings: {}, studyInfo, petComputedlInfo: { level: 1 } },
    info: { health: 5, mood: 500 },
    activity: () => null,
    goodOf: (type, id) => ({
      id,
      type,
      object: '语文',
      tolkName: `${id}-名称`,
      classNum: SCHOOLS[id.split('-')[0]][0],
      classNumUp: SCHOOLS[id.split('-')[0]][1],
    }),
    attrs: () => '',
  }
  const source = jobs
    .replace(/^import .*$/gm, '')
    .replace(/^export \{.*\}$/gm, '')
    .replace(/^export (?=(?:async )?(?:function|const|let|var|class|type|interface))/gm, '')
  runInNewContext(
    `${stripTypeScriptTypes(source)}
this.studyLessons = studyLessons
this.describeStudy = describeStudy
this.studyDone = studyDone
this.studyMenu = studyMenu
this.examPending = examPending
this.STUDY_SCHOOLS = STUDY_SCHOOLS
this.PAGE = 4`,
    context,
  )
  return context
}

test('every study stage opens with its own menu: lessons reached, or the hint to finish the last one', () => {
  // The pet finished 小学 (10 lessons) and is working through 中学.
  const m = schoolModule({ chinese: 10, mathematics: 10, politics: 10, music: 10, art: 10, manner: 10, pe: 10, labouring: 10, wushu: 10 })
  // Cross-realm arrays do not compare with deepEqual: compare the joined keys.
  assert.equal(m.STUDY_SCHOOLS.map(([key]) => key).join(','), KEYS.join(','))
  // One menu entry per subject (nine), not per lesson: 小学 is behind, so all nine are finished.
  assert.equal(m.studyLessons('xx').length, 9)
  assert.ok(m.studyLessons('xx').every((g) => m.studyDone(g)))
  // 中学 is the current stage: its nine entries are not finished yet.
  assert.equal(m.studyLessons('zx').length, 9)
  assert.ok(m.studyLessons('zx').every((g) => !m.studyDone(g)))
  // The stages still ahead have no lesson to show: the panel says 快去完成之前学业吧~ instead.
  for (const key of ['dx', 'yjs', 'xwzj']) assert.equal(m.studyLessons(key).length, 0)
})

test('every stage menu pages in fours, including the short last page', () => {
  const m = schoolModule({ chinese: 10, mathematics: 10, politics: 10, music: 10, art: 10, manner: 10, pe: 10, labouring: 10, wushu: 10 })
  for (const key of ['xx', 'zx']) {
    const lessons = m.studyLessons(key)
    const pages = Math.ceil(lessons.length / m.PAGE)
    for (let page = 1; page <= pages; page++) {
      const slice = lessons.slice((page - 1) * m.PAGE, page * m.PAGE)
      assert.ok(slice.length > 0 && slice.length <= m.PAGE, `${key} page ${page} holds 1..4`)
      assert.ok(slice.every((g) => typeof g.name === 'string' && g.name.length > 0), `${key} page ${page} names the lessons`)
    }
    // The last page is the only one that may be short.
    const last = lessons.length % m.PAGE
    if (last) assert.equal(lessons.slice(-last).length, last)
  }
})

test('a stage at its last lesson shows the exam prompt, not a finished course', () => {
  // All nine lessons studied but the exam not taken: pending, and not marked done.
  const m = schoolModule({ chinese: 9, mathematics: 9, politics: 9, music: 9, art: 9, manner: 9, pe: 9, labouring: 9, wushu: 9 })
  const lessons = m.studyLessons('xx')
  assert.equal(lessons.length, 9)
  assert.ok(lessons.every((g) => m.examPending(g)))
  assert.ok(lessons.every((g) => !m.studyDone(g)))
})

test('the stage buttons stay pressable: the strip only captures the pointer once it is a drag', () => {
  const tabBar = control.slice(control.indexOf('function tabBar('), control.indexOf('interface Tab {'))
  const down = tabBar.slice(tabBar.indexOf("addEventListener('pointerdown'"), tabBar.indexOf("addEventListener('pointermove'"))
  // Capturing on the press retargets pointerup/click to the strip, and no stage button can be pressed.
  assert.doesNotMatch(down, /setPointerCapture/)
  assert.match(tabBar, /if \(Math\.abs\(moved\) <= 6\) return\s*dragging = true\s*strip\.setPointerCapture\(event\.pointerId\)/)
  // A drag must not also press the stage button it started on.
  assert.match(tabBar, /if \(!dragging\) return\s*dragging = false\s*event\.stopPropagation\(\)\s*event\.preventDefault\(\)/)
})

test('every stage button is wired to the panel it belongs to', () => {
  assert.match(control, /tabs: \(\) => STUDY_SCHOOLS\.map\(\(\[key, label\]\) => \(\{ label, on: key === studyTab, star: schoolDone\(key\), run: \(\) => pickSchool\(panel, key\) \}\)\)/)
  assert.match(control, /const pickSchool = \(panel: Panel, key: string\): void => \{\s*studyTab = key\s*openPanel\(panel, 1\)/)
})

test('a stage lists the lessons still to do first, the certified ones after them', () => {
  // 语文/数学 passed (certificates), 政治 studied but not examined, the rest untouched.
  const m = schoolModule({ chinese: 10, mathematics: 10, politics: 9, music: 5, art: 0, manner: 0, pe: 0, labouring: 0, wushu: 0 })
  const ids = m.studyMenu('xx').map((g) => g.id)
  // Unfinished first, in subject order (政治 学完未考 counts as unfinished, no certificate yet), then the certified.
  assert.equal(ids.join(','), 'xx-politics,xx-music,xx-art,xx-manner,xx-pe,xx-labouring,xx-wushu,xx-chinese,xx-mathematics')
})

test('a stage with nothing finished keeps its subject order, and so does one with everything done', () => {
  const fresh = schoolModule({ chinese: 0, mathematics: 0, politics: 0, music: 0, art: 0, manner: 0, pe: 0, labouring: 0, wushu: 0 })
  assert.equal(fresh.studyMenu('xx').map((g) => g.id).join(','), 'xx-chinese,xx-mathematics,xx-politics,xx-music,xx-art,xx-manner,xx-pe,xx-labouring,xx-wushu')
  const all = schoolModule({ chinese: 10, mathematics: 10, politics: 10, music: 10, art: 10, manner: 10, pe: 10, labouring: 10, wushu: 10 })
  assert.equal(all.studyMenu('xx').map((g) => g.id).join(','), 'xx-chinese,xx-mathematics,xx-politics,xx-music,xx-art,xx-manner,xx-pe,xx-labouring,xx-wushu')
})

test('a stage still ahead shows nothing, so the order there is empty too', () => {
  const m = schoolModule({ chinese: 10, mathematics: 10, politics: 10, music: 10, art: 10, manner: 10, pe: 10, labouring: 10, wushu: 10 })
  assert.equal(m.studyMenu('dx').length, 0)
})
