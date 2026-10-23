// The 贴心宝贝 and 作弊 sections of the settings panel: hand-built forms rather than the option list.
import { finishTask } from '../pet/activity'
import { C, canCustody, care, custody, label, setCare, setCustody, tickCustody } from '../pet/custody'
import type { CustodyKind } from '../pet/custody-core'
import { allGoods, TYPE_NAMES, type GoodType } from '../pet/data/goods'
import { addGood, listGoods } from '../pet/goods'
import { give } from '../pet/items'
import { setSubject, subjects, workGoods } from '../pet/jobs'
import { frozen, setFrozen, skipTime, speak } from '../pet/pet'
import { need } from '../pet/level'
import PROVINCES from '../pet/data/travel.json'
import { clearPinkDiamond, openPinkDiamond } from '../pet/vip'
import { busy, info, save, setInfo, stage, syncLevel, update } from '../pet/store'
import { dayStart } from '../pet/vip'
import { formatDate } from './date'
import { button, div, typeable } from './dom'
import { buySweetHeart, buySweetHeartWithDiamond, sweetHeart } from './state'
import { SWEET_DAYS_PER_DIAMOND } from '../pet/diamond'
import { careLog, clearCareLog, spentToday } from '../pet/sweetcare'

type Redraw = () => void

export const btn = (text: string, run: () => void, disabled = false, cls = ''): HTMLElement => {
  const b = button(`sbtn focusPress ${cls}${disabled ? ' off' : ''}`, () => !disabled && run(), text)
  return b
}

export function check(text: string, on: boolean, toggle: () => void, title = ''): HTMLElement {
  const row = button('scheck focusPress', toggle, div(on ? 'cb on' : 'cb'), div('t', text))
  row.title = title
  return row
}

/**
 * A drop-down drawn in the page: native <select> pop-ups are unreliable in the transparent, always-on-top pet
 * window (the pick is lost) and differ across WebViews.
 */
export function select(opts: [string, string][], value: string, change: (v: string) => void, cls = ''): HTMLElement {
  const text = (v: string): string => opts.find(([k]) => k === v)?.[1] ?? opts[0]?.[1] ?? ''
  const cur = div('cur', text(value))
  const menu = div('menu')
  const wrap = div(`ssel ${cls}`, cur, menu)
  const shut = (): void => {
    wrap.classList.remove('open')
    document.removeEventListener('pointerdown', outside, true)
  }
  const outside = (e: Event): void => {
    if (!wrap.contains(e.target as Node)) shut()
  }
  for (const [v, t] of opts)
    menu.append(
      button(v === value ? 'opt on' : 'opt', () => {
        cur.textContent = t
        shut()
        change(v)
      }, t),
    )
  cur.addEventListener('click', () => {
    // Open upwards when the page has more room above; never past the scrolling page.
    const page = wrap.closest('.sbody')?.getBoundingClientRect()
    const r = wrap.getBoundingClientRect()
    if (page) {
      const below = page.bottom - r.bottom - 4
      const above = r.top - page.top - 4
      const up = below < 160 && above > below
      wrap.classList.toggle('up', up)
      menu.style.maxHeight = `${Math.max(80, Math.min(220, up ? above : below))}px`
    }
    if (wrap.classList.toggle('open')) document.addEventListener('pointerdown', outside, true)
    else shut()
  })
  return wrap
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
let diamondBuy = 1
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
  // Not running and nothing under way: say so first, so this line agrees with custodyFoot below.
  if (!c.running && !c.launched) return c.cur > 0 || c.rounds > 0 ? `已暂停 · 下一项：${cur}` : `未开始 · 第一项：${cur}`
  if (!info.sweetHeart) return `贴心宝贝未开启，托管暂停 · 下一项：${cur}`
  if (save.settings.paused) return `暂停成长中，托管全部暂停 · 当前：${cur}`
  if (c.launched && busy()) return `执行中：${cur}`
  if (c.launched) return `等待开始：${cur}（宠物现在无法出发时，约5分钟后重试）`
  if (busy()) return `等待当前活动结束 · 下一项：${cur}`
  return `即将开始：${cur}`
}

export function custodyFoot(): string {
  const c = custody()
  const p = C.position(c)
  const started = c.launched || c.cur > 0 || c.rounds > 0
  const state = !c.running ? (started ? '已暂停' : '关闭') : canCustody() ? '开启' : '暂停中'
  return `已完成 ${c.rounds} 轮 · 托管${state} · 当前 / 下一项 ${p.cur} / ${p.next || '-'}`
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
    div('scare', div('k wide', `用钻石（现有 ${info.diamond} 颗，1颗=${SWEET_DAYS_PER_DIAMOND}天）`), numInput(diamondBuy, (n) => (diamondBuy = Math.max(1, Math.round(n))), 'num'), btn('颗钻石开通', () => buySweetHeartWithDiamond(diamondBuy) && redraw(), info.diamond < 1)),
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
  // More care
  const opt = (text: string, key: 'heal' | 'revive' | 'restock' | 'exam' | 'work' | 'notify' | 'farm' | 'fish' | 'fishFeed', title = ''): HTMLElement =>
    check(text, cfg[key], () => {
      setCare({ [key]: !cfg[key] })
      redraw()
    }, title)
  out.push(
    opt('生病时自动看病吃药（买药按医院价）', 'heal'),
    opt('宠物死亡时自动用还魂丹复活', 'revive'),
    opt('背包里没有对应物品时，自动去商城买最划算的', 'restock'),
    div('scare', div('k wide', '每天最多花费'), numInput(cfg.budget, (n) => setCare({ budget: n }), 'num'), div('', `元宝（今天已花 ${spentToday()}）`)),
    opt('学习达到升学条件时自动考试通过', 'exam'),
    opt('元宝不足时自己去打工（挑收入最高且能胜任的工作）', 'work', '托管队列运行时不会另外打工'),
    div('scare', div('k wide', '元宝低于'), numInput(cfg.workBelow, (n) => setCare({ workBelow: n }), 'num'), div('', '时去打工')),
    opt('自动打理农场（收获、浇水除草杀虫、铲除、用包袱种子播种）', 'farm', '农场窗口打开时不自动操作，避免和游戏冲突'),
    opt('自动打理鱼塘（收成熟的鱼）', 'fish'),
    div('sindent', opt('花元宝喂鱼（喂未成熟的鱼，每条每次 10 元宝，算进每日预算）', 'fishFeed', '不勾选时只收成熟的鱼，不花元宝')),
    opt('做了事情时用气泡告诉我', 'notify', '关闭后只记在下面的日志里'),
  )
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
  // Log
  const log = careLog()
  out.push(
    div('shr'),
    h3('贴心宝贝日志'),
    div(
      'slog',
      ...(log.length ? log.map((e) => div('le', div('t', formatDate(e.t, 'MM-DD HH:mm')), div('s', e.s))) : [div('qempty', '还没有记录')]),
    ),
    row(btn('清空日志', () => (clearCareLog(), redraw()), !log.length)),
  )
  return out
}

// ---------------------------------------------------------------- 作弊

let grantType: GoodType = 'food'
let grantId = ''
let grantNum = 10
let ybAdd = 1000
let growthAdd = 5000
let pdDays = 30
let diamondAdd = 10
let skipHours = 1

const say = (s: string): void => speak({ s, now: true }, 'appear')
const ALL_TYPES: GoodType[] = ['food', 'clean', 'medicine', 'toy', 'background']

/** A number box with a button that applies it. */
function amount(value: number, keep: (n: number) => void, label: string, run: (n: number) => void, min = 1): HTMLElement {
  let n = value
  return div(
    'sadd',
    numInput(value, (v) => {
      n = Math.max(min, Math.round(v))
      keep(n)
    }, 'grow'),
    btn(label, () => run(n)),
  )
}

export function cheatSection(redraw: Redraw): HTMLElement[] {
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
  const toggle = (text: string, on: boolean, set: () => void, title = ''): HTMLElement =>
    check(text, on, () => {
      set()
      redraw()
    }, title)
  const out: HTMLElement[] = [note('直接修改存档里的数值，回车或离开输入框生效。')]

  out.push(
    h3('元宝、钻石与粉钻'),
    field('增加元宝（可填负数扣除）'),
    amount(ybAdd, (n) => (ybAdd = n), '增加元宝', (n) => {
      setInfo('yb', Math.max(0, info.yb + n))
      say(`[host]，元宝${n >= 0 ? '增加' : '减少'}了${Math.abs(n)}，现在有${info.yb}！`)
      redraw()
    }, -1e9),
    field(`增加钻石（现有 ${info.diamond} 颗，可填负数扣除）`),
    amount(diamondAdd, (n) => (diamondAdd = n), '增加钻石', (n) => {
      setInfo('diamond', Math.max(0, info.diamond + n))
      say(`[host]，现在有${info.diamond}颗钻石！`)
      redraw()
    }, -1e9),
    field(`粉钻天数（${info.pinkDiamond ? `当前 ${formatDate(info.PDiamondExpirationDate, 'YYYY-MM-DD')} 到期` : '未开通'}，满 365 天算年费）`),
    amount(pdDays, (n) => (pdDays = n), '开通 / 延长粉钻', (n) => {
      openPinkDiamond(n)
      say(`[host]，粉钻增加了${n}天！`)
      redraw()
    }),
    row(btn('清除粉钻', () => {
      clearPinkDiamond()
      say('[host]，粉钻已清除~')
      redraw()
    }, !info.pinkDiamond)),
  )

  out.push(
    h3('一键'),
    row(
      btn('状态全满', () => {
        setInfo('hunger', c.hungerMax)
        setInfo('clean', c.cleanMax)
        setInfo('mood', c.moodMax)
        if (info.health > 0) setInfo('health', 5)
        redraw()
      }),
      btn('治好生病', () => (setInfo('health', 5), redraw()), info.health === 0 || info.health === 5),
      btn('复活宠物', () => (setInfo('health', 5), redraw()), info.health !== 0),
      btn('立即完成当前活动', () => {
        if (!finishTask()) say('[host]，我现在没有在做事哦~')
        redraw()
      }, !busy()),
    ),
  )

  out.push(
    h3('属性'),
    div(
      'sgrid',
      stat('元宝', 'yb', Infinity),
      stat('饥饿', 'hunger', c.hungerMax),
      stat('清洁', 'clean', c.cleanMax),
      stat('心情', 'mood', c.moodMax),
      stat('健康', 'health', 5),
      stat('智力', 'intel', Infinity),
      stat('魅力', 'charm', Infinity),
      stat('武力', 'strong', Infinity),
      stat('成长值', 'growth', Infinity),
      field(
        `等级（当前 Lv${c.level} · ${{ Egg: '蛋', Kid: '少年', Adult: '成年' }[stage()]}）`,
        numInput(c.level, (n) => {
          setInfo('growth', need(Math.max(1, Math.min(200, Math.round(n))) - 1))
          syncLevel()
          redraw()
        }),
      ),
    ),
    field('增加成长值'),
    amount(growthAdd, (n) => (growthAdd = n), '增加成长值', (n) => {
      setInfo('growth', Math.max(0, info.growth + n))
      syncLevel()
      redraw()
    }, -1e9),
    note('等级 1-4 为蛋，5-15 为少年，16 起为成年。'),
  )

  out.push(
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
    row(
      btn('全部学完当前学校', () => {
        for (const s of subjects()) setSubject(s.key, schoolEnd(s.value))
        redraw()
      }),
      btn('全部研究生毕业', () => {
        for (const s of subjects()) setSubject(s.key, 168)
        redraw()
      }),
    ),
  )

  const goods = allGoods(grantType)
  if (!goods.some((g) => g.id === grantId)) grantId = goods[0]?.id ?? ''
  out.push(
    h3('物品'),
    div(
      'sadd',
      select(ALL_TYPES.map((t) => [t, TYPE_NAMES[t]]), grantType, (v) => ((grantType = v as GoodType), redraw()), 'kind'),
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
      btn('解锁全部物品（各1个）', () => {
        for (const t of ALL_TYPES) for (const g of allGoods(t)) addGood(t, g.id, 1)
        say('[host]，所有物品都解锁啦！')
      }),
    ),
    h3('旅游'),
    row(
      btn(`点亮全部 ${PROVINCES.length} 个省份`, () => {
        const old = save.gameSaveDatas.travel_china
        update('gameSaveDatas', { travel_china: PROVINCES.map((p) => old.find((t) => t.name === p.name) ?? { name: p.name, value: 1 }) })
        say('[host]，全国都去过啦！')
      }),
    ),
  )

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
    h3('时间与开关'),
    field('时间快进（小时，最多 48）'),
    amount(skipHours, (n) => (skipHours = n), '快进', (n) => {
      skipTime(Math.min(n, 48) * 60)
      say(`[host]，时间过去了${Math.min(n, 48)}小时~`)
      redraw()
    }),
    toggle('冻结状态（饥饿、清洁、心情不再下降）', frozen(), () => setFrozen(!frozen())),
    toggle('不会死亡', save.settings.undying, () => update('settings', { undying: !save.settings.undying })),
    toggle('聊天框金手指', save.settings.chatCheat, () => update('settings', { chatCheat: !save.settings.chatCheat }), '在聊天里输入「元宝+100000」等口令生效'),
  )
  return out
}

/** The studyInfo value at which the current school's lessons are all done. */
const schoolEnd = (v: number): number => [9, 30, 71, 167].find((m) => v < m) ?? v
