// 贴心宝贝 looking after the pet beyond food and play: doctor, revival, restocking, work, and a log of what it did.
import { bestJob, cheapest, parseLog, pushLog, spend, type LogEntry, type Spent } from './care'
import { canCustody, care, custody } from './custody'
import { allGoods, goodOf, type Good, type GoodType } from './data/goods'
import { DEAD, illOf } from './data/ills'
import { addGood, hasGood, takeGood } from './goods'
import { speak } from './pet'
import { activity, busy, info, save, setInfo, update } from './store'
import { dayStart } from './vip'

export const careLog = (): LogEntry[] => parseLog(save.saveJsonData.careLog)
export const clearCareLog = (): void => update('saveJsonData', { careLog: '[]' })

/** Records what 贴心宝贝 did; `say` also has the pet tell the owner (when bubbles are on). */
export function logCare(s: string, say = true): void {
  update('saveJsonData', { careLog: JSON.stringify(pushLog(careLog(), { t: Math.floor(Date.now() / 1000), s })) })
  if (say && care().notify) speak({ s: `[host]，${s}~`, now: true, ai: false }, 'speak')
}

const spent = (): Spent => {
  try {
    const o = JSON.parse(save.saveJsonData.careSpent || '{}') as Spent
    return { day: Number(o.day) || 0, yb: Number(o.yb) || 0 }
  } catch {
    return { day: 0, yb: 0 }
  }
}
export const spentToday = (): number => (spent().day === dayStart() ? spent().yb : 0)

/** Pays `cost` within today's budget; false (nothing paid) when over it or short of 元宝. */
function payCare(cost: number): boolean {
  const r = spend(spent(), dayStart(), cost, care().budget, info.yb)
  if (!r.ok) return false
  setInfo('yb', info.yb - cost)
  update('saveJsonData', { careSpent: JSON.stringify(r.spent) })
  return true
}

const unitPrice = (g: Good): number => (info.pinkDiamond ? Math.round(g.price! * 0.8) : g.price!)
const buyable = (g: Good): boolean => !!g.price && g.price > 0 && !g.outOfPrint && !(g.needLevel && save.petComputedlInfo.level < g.needLevel) && !(g.PD && !info.pinkDiamond)

/** Out of goods for a need: buys the best-value one in the shop. Returns it (now in the backpack) or nothing. */
export function restock(type: GoodType, stat: 'hunger' | 'clean' | 'mood'): Good | undefined {
  if (!care().restock) return undefined
  const g = cheapest(allGoods(type).filter(buyable), stat)
  if (!g || !payCare(unitPrice(g))) return undefined
  addGood(type, g.id, 1)
  logCare(`背包里没有了，用${unitPrice(g)}元宝买了${g.name}`, false)
  return goodOf(type, g.id)
}

let lastFail = 0
const FAIL_CD = 10 * 60_000
let lastWork = 0

/** Every growth tick while 贴心宝贝 is on. */
export function careTick(): void {
  if (!info.sweetHeart) return
  const cfg = care()
  const now = Date.now()
  if (info.health === 0) {
    if (!cfg.revive || now - lastFail < FAIL_CD) return
    const pill = goodOf('medicine', DEAD.cure.id)
    if (hasGood('medicine', pill.id)) takeGood(pill)
    else if (!payCare(Math.round((pill.price || 50) * 1.2))) {
      lastFail = now
      return logCare(`想用还魂丹救活宠物，但今天的预算或元宝不够`, false)
    }
    setInfo('health', 5)
    return logCare('宠物倒下了，我用还魂丹把它救了回来')
  }
  const line = activity('ill')
  if (info.health < 5 && line && cfg.heal && !busy() && now - lastFail >= FAIL_CD) {
    const ill = illOf(line + info.health)
    const g = goodOf('medicine', ill.cure.id)
    const fee = (5 - info.health) * 10
    const owned = hasGood('medicine', g.id)
    if (!payCare(fee + (owned ? 0 : Math.round((g.price || 50) * 1.2)))) {
      lastFail = now
      return logCare(`发现宠物得了${ill.name}，但今天的预算或元宝不够看病`, false)
    }
    if (owned) takeGood(g)
    setInfo('health', 5)
    return logCare(`带你去看了病（${ill.name}），用了${g.name}，已经好啦`)
  }
  if (cfg.work && info.yb < cfg.workBelow && !busy() && !(custody().running && canCustody()) && now - lastWork > FAIL_CD) {
    lastWork = now
    void import('./jobs').then(({ work, workGoods, qualifies }) => {
      const j = bestJob(workGoods(), qualifies)
      if (j && work(j)) logCare(`元宝不多了，自己去做${j.name}`, false)
    })
  }
}
