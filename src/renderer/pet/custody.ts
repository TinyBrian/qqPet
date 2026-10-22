// 贴心宝贝循环托管 driver: runs the queue (custody-core) on the growth tick, only while 贴心宝贝 is on.
import { onTaskStart } from './activity'
import { parseCare, type CareConfig } from './care'
import * as C from './custody-core'
import { goodOf } from './data/goods'
import { studySubject, travel, work } from './jobs'
import { busy, info, save, update } from './store'

export type { CareConfig }
export { C }

const listeners: (() => void)[] = []
export const onCustodyChange = (l: () => void): (() => boolean) => {
  listeners.push(l)
  return () => listeners.splice(listeners.indexOf(l), 1).length > 0
}

export const custody = (): C.Custody => C.parseCustody(save.saveJsonData.custody)
export function setCustody(c: C.Custody): void {
  update('saveJsonData', { custody: JSON.stringify(c) })
  for (const l of [...listeners]) l()
}

export const care = (): CareConfig => parseCare(save.saveJsonData.care)
export const setCare = (c: Partial<CareConfig>): void => update('saveJsonData', { care: JSON.stringify({ ...care(), ...c }) })

/** Custody may act: 贴心宝贝 is on, the pet is alive and growth isn't paused. */
export const canCustody = (): boolean => info.sweetHeart && info.health > 0 && !save.settings.paused

export function label(i: C.CustodyItem): string {
  if (i.kind === 'trip') return '旅游 · 随机目的地'
  if (i.kind === 'study') return `学习 · ${goodOf('study', `xx-${i.target}`).object ?? i.target}`
  return `工作 · ${goodOf('work', i.target).name ?? i.target}`
}

function launch(i: C.CustodyItem): 'started' | 'done' | 'no' {
  if (i.kind === 'trip') return travel() ? 'started' : 'no'
  if (i.kind === 'study') return studySubject(i.target, custody().autoExam)
  const g = goodOf('work', i.target)
  if (!g.useTime) return 'done'
  return work(g) ? 'started' : 'no'
}

/** Called every growth tick (and when custody starts). */
export function tickCustody(): void {
  let c = custody()
  const b = busy()
  if (c.launched && b && !c.seen) c = { ...c, seen: true }
  const s = C.step(c, b, canCustody(), Date.now())
  if (s === 'advance') c = C.advance(c)
  else if (s === 'launch') {
    const r = launch(c.queue[c.cur])
    if (r === 'done') c = C.advance(c)
    // The speech starts the activity a moment later; `seen` turns on at the next tick.
    else c = { ...c, launched: true, seen: false, tried: Date.now() }
    if (r === 'no') c = { ...c, launched: true, seen: false }
  }
  if (JSON.stringify(c) !== save.saveJsonData.custody) setCustody(c)
}

// A launched item's activity began: from now on its end (even an instant one) finishes the item.
onTaskStart(() => {
  const c = custody()
  if (c.launched && !c.seen) setCustody({ ...c, seen: true })
})
