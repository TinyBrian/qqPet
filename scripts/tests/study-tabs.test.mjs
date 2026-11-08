import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const jobs = readFileSync(new URL('../../src/renderer/pet/jobs.ts', import.meta.url), 'utf8')
const control = readFileSync(new URL('../../src/renderer/ui/control.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../src/renderer/ui/css/control.css', import.meta.url), 'utf8')

/** The five schools' lesson counts, as in goods.json: [lessons needed, studyInfo the school starts at]. */
const SCHOOLS = { xx: [9, 0], zx: [20, 10], dx: [40, 31], yjs: [95, 72], xwzj: [9999998, 168] }

// jobs.ts pulls in the whole pet at import time; the school helpers need only these values.
function schoolModule(studyInfo = {}) {
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
    `${stripTypeScriptTypes(source)}\nthis.schoolOf = schoolOf; this.majorSchool = majorSchool; this.STUDY_SCHOOLS = STUDY_SCHOOLS; this.studyLessons = studyLessons; this.studyDone = studyDone; this.nextSchool = nextSchool; this.schoolDone = schoolDone`,
    context,
  )
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

test('a finished school keeps its lessons and marks them done', () => {
  // 语文 and 数学 are at 大学 (50) and 中学 (20); the rest never started.
  const app = schoolModule({ chinese: 50, mathematics: 20 })
  const middle = app.studyLessons('zx')
  assert.deepEqual(Array.from(middle, (g) => g.id), ['zx-chinese', 'zx-mathematics'])
  assert.equal(app.studyDone(middle[0]), true, '中学语文 is passed at 30')
  assert.equal(app.studyDone(middle[1]), false, '中学数学 is still running')
  // 小学 is done for both of them, so its two lessons are listed as finished.
  const primary = app.studyLessons('xx')
  assert.deepEqual(Array.from(primary, (g) => g.id), ['xx-chinese', 'xx-mathematics'])
  assert.ok(primary.every((g) => app.studyDone(g)))
  // A school still ahead has nothing to show; the panel says to finish the last one instead of 空空如也.
  assert.equal(app.studyLessons('yjs').length, 0)
})

test('the school after this one is empty at 学无止境', () => {
  const app = schoolModule()
  assert.equal(app.nextSchool('xx'), 'zx')
  assert.equal(app.nextSchool('yjs'), 'xwzj')
  assert.equal(app.nextSchool('xwzj'), '')
})

test('stage buttons sit inside the brown bar without covering the close button', () => {
  const tabs = css.slice(css.indexOf('.ui-control .goodTabs {'))
  const body = tabs.slice(0, tabs.indexOf('}'))
  // The header strip is rows 0..20 of the art: 2px above and below a 17px row, 31px in from both ends.
  assert.match(body, /left: 31px/)
  assert.match(body, /right: 31px/)
  assert.match(body, /top: 2px/)
  assert.match(body, /height: 17px/)
  const tab = css.slice(css.indexOf('.ui-control .goodTab {'))
  assert.match(tab.slice(0, tab.indexOf('}')), /height: 17px/)
  const close = css.slice(css.indexOf('.ui-control .goodClose {'))
  assert.match(close.slice(0, close.indexOf('}')), /width: 25px/)
})

test('the transparent seam and the corner sliver behind the icon are patched over', () => {
  const panel = css.slice(css.indexOf('.ui-control .goodList {'))
  const panelBody = panel.slice(0, panel.indexOf('}'))
  // A cream fill under the art closes the 2px seam; the rounded radius keeps the square corners off.
  assert.match(panelBody, /background-color: #fee8d6/)
  assert.match(panelBody, /border-radius: 9px/)
  const corner = css.slice(css.indexOf('.ui-control .goodList::before {'))
  const cornerBody = corner.slice(0, corner.indexOf('}'))
  assert.match(cornerBody, /background-color: #9d775b/)
  assert.match(cornerBody, /border-radius: 8px 0 0 0/)
  assert.match(cornerBody, /height: 21px/)
  assert.match(cornerBody, /pointer-events: none/)
  const icon = css.slice(css.indexOf('.ui-control .goodTypeIcon {'))
  assert.match(icon.slice(0, icon.indexOf('}')), /z-index: 2/)
})

test('stage buttons centre their text and switch from light to deep yellow', () => {
  const tab = css.slice(css.indexOf('.ui-control .goodTab {'))
  const body = tab.slice(0, tab.indexOf('}'))
  assert.match(body, /justify-content: center/)
  assert.match(body, /align-items: center/)
  assert.match(body, /text-align: center/)
  assert.match(body, /background-color: #fdf0c2/)
  const on = css.slice(css.indexOf('.ui-control .goodTab.on {'))
  assert.match(on.slice(0, on.indexOf('}')), /background-color: #f0a91b/)
})

test('a finished school earns a faceted golden star before its label', () => {
  const app = schoolModule({ chinese: 50, mathematics: 50, politics: 50, music: 50, art: 50, manner: 50, pe: 50, labouring: 50, wushu: 50 })
  assert.equal(app.schoolDone('xx'), true, 'all nine passed 小学')
  assert.equal(app.schoolDone('zx'), true, 'and 中学 at 30')
  assert.equal(app.schoolDone('dx'), false, '大学 runs to 71')
  const partial = schoolModule({ chinese: 50 })
  assert.equal(partial.schoolDone('xx'), false, 'one subject still at 小学 keeps the star off')
  // The star itself: ten facet triangles, alternating light yellow and gold.
  assert.match(control, /star: schoolDone\(key\)/)
  assert.match(control, /\.\.\.\(tab\.star \? \[star\(\)\] : \[\]\)/)
  assert.equal((control.match(/<polygon points="12,12 /g) ?? []).length, 10)
  assert.match(control, /fill="#FEE662"/)
  assert.match(control, /fill="#FEBE00"/)
  const star = css.slice(css.indexOf('.ui-control .goodTabStar {'))
  const starBody = star.slice(0, star.indexOf('}'))
  assert.match(starBody, /width: 11px/)
  assert.match(starBody, /margin-right: 3px/)
})

test('an overflowing stage row scrolls with yellow triangles', () => {
  assert.match(control, /button\('tabArrow left', scroll\(-1\)\)/)
  assert.match(control, /button\('tabArrow right', scroll\(1\)\)/)
  assert.match(control, /classList\.toggle\('overflow'/)
  const arrow = css.slice(css.indexOf('.ui-control .tabArrow {'))
  assert.match(arrow.slice(0, arrow.indexOf('}')), /display: none/)
  const yellow = css.slice(css.indexOf('.ui-control .tabArrow.right {'))
  assert.match(yellow.slice(0, yellow.indexOf('}')), /border-left: 7px solid #f0a91b/)
  assert.match(css, /\.ui-control \.goodTabs\.overflow \.tabArrow/)
})

test('a finished lesson gets a certificate and guides to the next school', () => {
  assert.match(control, /done: studyDone/)
  assert.match(control, /if \(!studyDone\(g\)\) return study\(g\)/)
  assert.match(control, /我已经学完啦，接下来去学/)
  assert.match(control, /if \(label\) pickSchool\(panel, next\)/)
  const badge = css.slice(css.indexOf('.ui-control .goodItem.done .goodItemIconBox::before {'))
  assert.match(badge.slice(0, badge.indexOf('}')), /left: -5px/)
  assert.match(badge.slice(0, badge.indexOf('}')), /#f0a91b/)
  assert.match(css, /content: '证'/)
})

test('a school still ahead asks for the last one instead of 空空如也', () => {
  assert.match(control, /empty: '快去完成之前学业吧~'/)
  assert.match(control, /p\.empty \?\? ' 空空如也~~ '/)
})
