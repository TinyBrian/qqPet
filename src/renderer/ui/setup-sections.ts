// The 贴心宝贝 and 作弊 sections of the settings panel: hand-built forms rather than the option list.
import { finishTask } from '../pet/activity'
import { C, canCustody, care, custody, label, setCare, setCustody, tickCustody } from '../pet/custody'
import type { CustodyKind } from '../pet/custody-core'
import { allGoods, TYPE_NAMES, type GoodType } from '../pet/data/goods'
import { addGood, listGoods } from '../pet/goods'
import { give } from '../pet/items'
import { setSubject, subjects, workGoods } from '../pet/jobs'
import { speak } from '../pet/pet'
import { busy, info, save, setInfo, syncLevel } from '../pet/store'
import { dayStart } from '../pet/vip'
import { formatDate } from './date'
import { button, div, typeable } from './dom'
import { buySweetHeart, sweetHeart } from './state'

type Redraw = () => void

export const btn = (text: string, run: () => void, disabled = false, cls = ''): HTMLElement => {
  const b = button(`sbtn focusPress ${cls}${disabled ? ' off' : ''}`, () => !disabled && run(), text)
  return b
}

export function check(text: string, on: boolean, toggle: () => void, title = ''): HTMLElement {
  const row = button('scheck focusPress', toggle, div(on ? 'box on' : 'box'), div('t', text))
  row.title = title
  return row
}

export function select(opts: [string, string][], value: string, change: (v: string) => void, cls = ''): HTMLSelectElement {
  const s = document.createElement('select')
  s.className = `ssel ${cls}`
  for (const [v, t] of opts) s.append(Object.assign(document.createElement('option'), { value: v, textContent: t, selected: v === value }))
  s.addEventListener('pointerdown', () => window.qqpet.setFocusable(true))
  s.addEventListener('change', () => change(s.value))
  return s
}

export function numInput(value: number, set: (n: number) => void, cls = ''): HTMLInputElement {
  const i = typeable(Object.assign(document.createElement('input'), { className: `sinput ${cls}`, value: String(Math.round(value)), inputMode: 'numeric' }))
  i.addEventListener('change', () => {
    const n = Number(i.value)
    if (Number.isFinite(n)) set(n)
  })
  return i
}

const h3 = (t: string): HTMLElement => div('sh3', t)
const note = (t: string): HTMLElement => div('snote', t)
const row = (...c: (Node | string)[]): HTMLElement => div('srow', ...c)
const field = (t: string, ...c: (Node | string)[]): HTMLElement => div('sfield', div('k', t), ...c)

// ---------------------------------------------------------------- 贴心宝贝

let kind: CustodyKind = 'trip'
let target = ''

const NEEDS = [
  { stat: 'hunger', type: 'food', name: '饥饿', key: 'food' },
  { stat: 'clean', type: 'clean', name: '清洁', key: 'cleanGood' },
  { stat: 'mood', type: 'toy', name: '心情', key: 'toy' },
] as const

function targets(k: CustodyKind): [string, string][] {
  if (k === 'trip') return [['', '随机目的地']]
  if (k === 'study') return subjects().map((s) => [s.key, s.name])
  return workGoods().map((g) => [g.id, `${g.name}（${g.useTime}分钟，${g.yb}元宝）`])
}

function status(): string {
  if (!info.sweetHeartOverTime) return '贴心宝贝：未开通（300元宝/天）。开通后可自动照顾和循环托管。'
  const when = formatDate(info.sweetHeartOverTime, 'YYYY-MM-DD HH:mm')
  return `贴心宝贝：${info.sweetHeart ? '已开启' : '已关闭'} · ${when} 到期`
}

export function custodyLine(): string {
  const c = custody()
  if (!c.queue.length) return '队列为空，添加项目后开始托管'
  const cur = label(c.queue[c.cur])
  if (!info.sweetHeart) return `贴心宝贝未开启，托管暂停 · 下一项：${cur}`
  if (save.settings.paused) return `暂停成长中，托管全部暂停 · 当前：${cur}`
  if (c.launched && busy()) return `执行中：${cur}`
  if (c.launched) return `等待开始：${cur}（宠物现在无法出发时，约5分钟后重试）`
  if (busy()) return `等待当前活动结束 · 下一项：${cur}`
  return c.running ? `即将开始：${cur}` : `已暂停 · 下一项：${cur}`
}

export function custodyFoot(): string {
  const c = custody()
  const p = C.position(c)
  return `已完成 ${c.rounds} 轮 · 托管${c.running ? '开启' : '关闭'} · 当前 / 下一项 ${p.cur} / ${p.next || '-'}`
}

/** The live lines the panel refreshes every few seconds. */
export const live: { line?: HTMLElement; foot?: HTMLElement; stats?: HTMLElement } = {}

function statsLine(): string {
  const c = save.petComputedlInfo
  return `当前 饥饿 ${Math.round(info.hunger)}/${c.hungerMax} · 清洁 ${Math.round(info.clean)}/${c.cleanMax} · 心情 ${Math.round(info.mood)}/1000`
}

export function refreshLive(): void {
  if (live.line) live.line.textContent = custodyLine()
  if (live.foot) live.foot.textContent = custodyFoot()
  if (live.stats) live.stats.textContent = statsLine()
}

export function sweetSection(redraw: Redraw): HTMLElement[] {
  const c = custody()
  const cfg = care()
  const set = (n: C.Custody): void => {
    setCustody(n)
    redraw()
  }
  const out: HTMLElement[] = []
  // Status and membership
  out.push(
    div('sstatus', status()),
    row(
      btn(info.sweetHeartOverTime ? '续费贴心宝贝' : '开通贴心宝贝', buySweetHeart),
      ...(info.sweetHeartOverTime ? [btn(info.sweetHeart ? '关闭贴心宝贝' : '开启贴心宝贝', sweetHeart)] : []),
    ),
  )
  // Auto care (#116)
  live.stats = div('snote', statsLine())
  out.push(
    div('shr'),
    h3('自动照顾'),
    note('贴心宝贝开启时，低于设定比例会自动使用背包里的物品；选「自动」时挑最不浪费的。'),
    live.stats,
    check('自动喂食 / 清洁 / 玩耍', cfg.on, () => {
      setCare({ on: !cfg.on })
      redraw()
    }),
  )
  for (const n of NEEDS) {
    const owned = listGoods(n.type, 1, Number.MAX_SAFE_INTEGER).list.filter((g) => (g[n.stat] ?? 0) > 0)
    const chosen = cfg[n.key]
    const opts: [string, string][] = [['', '自动（最省）'], ...owned.map((g): [string, string] => [g.id, `${g.name} ×${g.num}`])]
    if (chosen && !owned.some((g) => g.id === chosen)) opts.push([chosen, '（已用完，改用自动）'])
    out.push(
      div(
        'scare',
        div('k', `${n.name}低于`),
        btn('−', () => (setCare({ [n.stat]: Math.max(0, cfg[n.stat] - 5) }), redraw()), false, 'mini'),
        div('pct', `${cfg[n.stat]}%`),
        btn('+', () => (setCare({ [n.stat]: Math.min(100, cfg[n.stat] + 5) }), redraw()), false, 'mini'),
        select(opts, chosen, (v) => setCare({ [n.key]: v }), 'grow'),
      ),
    )
  }
  // Custody queue
  out.push(
    div('shr'),
    h3('循环托管'),
    note('按顺序完成每个项目后再执行下一项。编辑队列会暂停托管，当前活动会正常结束；暂停成长时全部暂停。'),
    check('执行完最后一项后，从第一项循环', c.loop, () => set({ ...c, loop: !c.loop })),
    check('学习达到升学条件时自动通过考试', c.autoExam, () => set({ ...c, autoExam: !c.autoExam })),
  )
  const list = div('squeue')
  if (!c.queue.length) list.append(div('qempty', '还没有项目'))
  c.queue.forEach((it, i) =>
    list.append(
      div(
        i === c.cur ? 'qitem cur' : 'qitem',
        div('qname', `${i + 1}. ${label(it)}`),
        btn('上移', () => set(C.moveItem(c, i, -1)), i === 0),
        btn('下移', () => set(C.moveItem(c, i, 1)), i === c.queue.length - 1),
        btn('删除', () => set(C.removeItem(c, i))),
      ),
    ),
  )
  const ts = targets(kind)
  if (!ts.some(([v]) => v === target)) target = ts[0]?.[0] ?? ''
  out.push(
    list,
    div(
      'sadd',
      select(
        [
          ['trip', '旅游'],
          ['study', '学习'],
          ['work', '工作'],
        ],
        kind,
        (v) => {
          kind = v as CustodyKind
          target = ''
          redraw()
        },
        'kind',
      ),
      select(ts, target, (v) => (target = v), 'grow'),
      btn('添加项目', () => set(C.addItem(c, { kind, target }))),
    ),
    row(
      btn('开始 / 继续托管', () => {
        if (!info.sweetHeart) speak({ s: '[host]，要先开启贴心宝贝才能托管哦~', now: true, ai: false }, 'speak')
        setCustody(C.start(custody()))
        if (canCustody()) tickCustody()
        redraw()
      }, !c.queue.length),
      btn('暂停后续项目', () => set(C.pause(c)), !c.running),
      btn('停止托管项目并重置', () => set(C.reset(c))),
    ),
  )
  live.line = div('srun', custodyLine())
  live.foot = div('snote foot', custodyFoot())
  out.push(live.line, live.foot)
  return out
}

// ---------------------------------------------------------------- 作弊

let grantType: GoodType = 'food'
let grantId = ''
let grantNum = 10

const say = (s: string): void => speak({ s, now: true }, 'appear')

export function cheatSection(redraw: Redraw, legacy: HTMLElement[]): HTMLElement[] {
  const c = save.petComputedlInfo
  const stat = (name: string, key: 'yb' | 'hunger' | 'clean' | 'mood' | 'health' | 'growth' | 'intel' | 'charm' | 'strong', max: number) =>
    field(
      max < Infinity ? `${name}（0-${max}）` : name,
      numInput(info[key], (n) => {
        setInfo(key, Math.max(0, Math.min(max, Math.round(n))))
        if (key === 'growth') syncLevel()
        redraw()
      }),
    )
  const out: HTMLElement[] = [
    note('直接修改存档里的数值，回车或离开输入框生效。'),
    h3('属性'),
    div(
      'sgrid',
      stat('元宝', 'yb', Infinity),
      stat('饥饿', 'hunger', c.hungerMax),
      stat('清洁', 'clean', c.cleanMax),
      stat('心情', 'mood', 1000),
      stat('健康', 'health', 5),
      stat(`成长值（当前 Lv${c.level}）`, 'growth', Infinity),
      stat('智力', 'intel', Infinity),
      stat('魅力', 'charm', Infinity),
      stat('武力', 'strong', Infinity),
    ),
    h3('学习进度（已学课时）'),
    div(
      'sgrid',
      ...subjects().map((s) =>
        field(
          `${s.name}${s.diploma ? ` · ${s.diploma}` : ''}`,
          numInput(s.value, (n) => {
            setSubject(s.key, n)
            redraw()
          }),
        ),
      ),
    ),
  ]
  // Items
  const types: GoodType[] = ['food', 'clean', 'medicine', 'toy', 'background']
  const goods = allGoods(grantType)
  if (!goods.some((g) => g.id === grantId)) grantId = goods[0]?.id ?? ''
  out.push(
    h3('物品'),
    div(
      'sadd',
      select(types.map((t) => [t, TYPE_NAMES[t]]), grantType, (v) => ((grantType = v as GoodType), redraw()), 'kind'),
      select(goods.map((g) => [g.id, g.name]), grantId, (v) => (grantId = v), 'grow'),
      numInput(grantNum, (n) => (grantNum = Math.max(1, Math.min(9999, Math.round(n)))), 'num'),
      btn('发放', () => {
        const g = goods.find((x) => x.id === grantId)
        if (g) give([{ ...g, num: grantNum }], `[host]，我获得了${grantNum}个${g.name}！`)
      }),
    ),
    row(
      btn(`解锁全部${TYPE_NAMES[grantType]}（各1个）`, () => {
        for (const g of goods) addGood(grantType, g.id, 1)
        say(`[host]，${TYPE_NAMES[grantType]}全部解锁啦！`)
      }),
    ),
  )
  // Sweetheart expiry
  const date = typeable(Object.assign(document.createElement('input'), { type: 'date', className: 'sinput grow' }))
  if (info.sweetHeartOverTime) date.value = formatDate(info.sweetHeartOverTime, 'YYYY-MM-DD')
  const setExpiry = (sec: number): void => {
    setInfo('sweetHeartOverTime', sec)
    setInfo('sweetHeart', sec > dayStart())
    redraw()
  }
  out.push(
    h3('贴心宝贝到期'),
    div(
      'sadd',
      date,
      btn('设置', () => {
        const [y, m, d] = date.value.split('-').map(Number)
        if (y) setExpiry(new Date(y, m - 1, d, 6).getTime() / 1000)
      }),
      btn('+30天', () => setExpiry(Math.max(info.sweetHeartOverTime, dayStart()) + 30 * 86400)),
      btn('清除', () => setExpiry(0)),
    ),
    h3('活动'),
    row(
      btn('立即完成当前旅游/学习/工作', () => {
        if (!finishTask()) say('[host]，我现在没有在做事哦~')
        redraw()
      }, !busy()),
    ),
    h3('其他'),
    ...legacy,
  )
  return out
}
