import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const jobs = readFileSync(new URL('../../src/renderer/pet/jobs.ts', import.meta.url), 'utf8')
const control = readFileSync(new URL('../../src/renderer/ui/control.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../src/renderer/ui/css/control.css', import.meta.url), 'utf8')

// jobs.ts pulls in the whole pet at import time; its tip helpers only read these few values.
function tipModule(state = {}) {
  const context = {
    save: {
      settings: { paused: state.paused ?? false },
      studyInfo: state.study ?? {},
      petComputedlInfo: { level: state.level ?? 1 },
    },
    info: { health: state.health ?? 5, mood: state.mood ?? 500, charm: state.charm ?? 0, intel: state.intel ?? 0, strong: state.strong ?? 0 },
    activity: (kind) => (kind === state.doing ? 'active' : null),
    goodOf: () => ({ object: '语文' }),
    attrs: () => '',
  }
  const source = jobs
    .replace(/^import .*$/gm, '')
    .replace(/^export \{.*\}$/gm, '')
    .replace(/^export (?=(?:async )?(?:function|const|let|var|class|type|interface))/gm, '')
  runInNewContext(`${stripTypeScriptTypes(source)}\nthis.jobLines = jobLines; this.describeWork = describeWork; this.workBlocker = workBlocker`, context)
  return context
}

const job = (over = {}) => ({ id: '1', name: '送报纸', type: 'work', url: '', useTime: 30, yb: 20, num: 1, ...over })

test('a job the pet cannot take yet flags every requirement it misses', () => {
  const app = tipModule({ level: 5 })
  const lines = app.jobLines(job({ needLevel: 10, education: { chinese: 30 }, useArtt: { charm: 10 } }), {
    level: 5,
    study: { chinese: 0 },
    attrs: { charm: 3 },
  })
  // Values cross a vm realm boundary, so compare text rather than array identity.
  assert.equal(lines.filter((line) => line.bad).map((line) => line.text).join('|'), '需要大于10级~|学历要求：小学语文|属性要求：魅力：10')
})

test('a job whose requirements are met keeps every line plain', () => {
  const app = tipModule({ level: 20 })
  const lines = app.jobLines(job({ needLevel: 10, education: { chinese: 9 }, useArtt: { charm: 10 } }), {
    level: 20,
    study: { chinese: 30 },
    attrs: { charm: 12 },
  })
  assert.ok(lines.every((line) => !line.bad), JSON.stringify(lines))
})

test('work is greyed while the pet cannot work, and the tip says why in red', () => {
  const cases = [
    [{ health: 0 }, '生命值为 0，无法工作'],
    [{ health: 4 }, '生病中，无法工作'],
    [{ paused: true }, '已暂停成长，无法工作'],
    [{ mood: 0 }, '心情为 0，无法工作'],
    [{ doing: 'work' }, '正在打工，等下班再说'],
    [{ doing: 'study' }, '正在上课，等下课再说'],
    [{ doing: 'trip' }, '正在旅游，等回来再说'],
  ]
  for (const [state, text] of cases) {
    const app = tipModule({ level: 5, ...state })
    assert.equal(app.workBlocker(), text)
    const first = app.describeWork(job())[0]
    assert.equal(first.text, text)
    assert.equal(first.bad, true)
  }
  assert.equal(tipModule({ level: 5 }).workBlocker(), '')
})

test('a locked job greys its icon and paints the missed lines red', () => {
  assert.match(control, /const locked = lines\.some\(\(line\) => line\.bad\)/)
  assert.match(control, /`goodItem\$\{locked \? ' locked' : ''\}\$\{done \? ' done' : ''\}`/)
  assert.match(control, /`goodDatas\$\{line\.bad \? ' bad' : ''\}`/)
  const locked = css.slice(css.indexOf('.ui-control .goodItem.locked .goodItemIcon {'))
  assert.match(locked.slice(0, locked.indexOf('}')), /filter:\s*grayscale\(1\)/)
  const bad = css.slice(css.indexOf('.ui-control .goodDatas.bad {'))
  assert.match(bad.slice(0, bad.indexOf('}')), /color:\s*#ff5a5a/)
})
