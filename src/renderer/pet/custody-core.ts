// 贴心宝贝循环托管: the queue and its state, free of the DOM and the store so it can be unit tested.

export type CustodyKind = 'trip' | 'study' | 'work'

export interface CustodyItem {
  kind: CustodyKind
  /** Study: subject key; work: job id; trip: '' (random destination). */
  target: string
}

export interface Custody {
  queue: CustodyItem[]
  /** Index of the current item. */
  cur: number
  /** Start over at the first item after the last. */
  loop: boolean
  /** Pass the exam automatically when a subject is ready for the next school. */
  autoExam: boolean
  /** The user started custody and has not paused or stopped it. */
  running: boolean
  /** The current item was launched (its activity may be running). */
  launched: boolean
  /** The launched activity was seen running, so its end means the item is done. */
  seen: boolean
  /** Unix ms of the last launch attempt, to retry slowly when the pet can't start. */
  tried: number
  /** Rounds completed. */
  rounds: number
}

export const emptyCustody = (): Custody => ({
  queue: [],
  cur: 0,
  loop: true,
  autoExam: true,
  running: false,
  launched: false,
  seen: false,
  tried: 0,
  rounds: 0,
})

const KINDS: CustodyKind[] = ['trip', 'study', 'work']

/** Reads a saved custody; anything malformed falls back to the defaults. */
export function parseCustody(raw: string | undefined): Custody {
  const d = emptyCustody()
  let o: Partial<Custody>
  try {
    o = JSON.parse(raw || '{}') as Partial<Custody>
  } catch {
    return d
  }
  if (!o || typeof o !== 'object') return d
  const queue = Array.isArray(o.queue)
    ? o.queue.filter((i): i is CustodyItem => !!i && KINDS.includes(i.kind) && typeof i.target === 'string').map((i) => ({ kind: i.kind, target: i.target }))
    : []
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
  const b = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt)
  return {
    queue,
    cur: queue.length ? Math.min(n(o.cur), queue.length - 1) : 0,
    loop: b(o.loop, d.loop),
    autoExam: b(o.autoExam, d.autoExam),
    running: b(o.running, false) && queue.length > 0,
    launched: b(o.launched, false),
    seen: b(o.seen, false),
    tried: n(o.tried),
    rounds: n(o.rounds),
  }
}

/** Editing the queue pauses custody; an activity already running ends normally, and the edit takes the next item. */
function edited(c: Custody, queue: CustodyItem[], cur: number): Custody {
  return { ...c, queue, cur: queue.length ? Math.max(0, Math.min(cur, queue.length - 1)) : 0, running: false, launched: false, seen: false }
}

export const addItem = (c: Custody, item: CustodyItem): Custody => edited(c, [...c.queue, { ...item }], c.cur)

export function removeItem(c: Custody, i: number): Custody {
  if (i < 0 || i >= c.queue.length) return c
  return edited(c, c.queue.filter((_, j) => j !== i), i < c.cur ? c.cur - 1 : c.cur)
}

/** Moves an item up (-1) or down (+1); the current marker follows the item it was on. */
export function moveItem(c: Custody, i: number, dir: -1 | 1): Custody {
  const j = i + dir
  if (i < 0 || j < 0 || i >= c.queue.length || j >= c.queue.length) return c
  const q = [...c.queue]
  ;[q[i], q[j]] = [q[j], q[i]]
  const cur = c.cur === i ? j : c.cur === j ? i : c.cur
  return edited(c, q, cur)
}

export const start = (c: Custody): Custody => (c.queue.length ? { ...c, running: true } : c)
/** Pauses the items after the current one; its activity, if running, ends normally. */
export const pause = (c: Custody): Custody => ({ ...c, running: false })
/** Stops custody and starts over at the first item. */
export const reset = (c: Custody): Custody => ({ ...c, running: false, launched: false, seen: false, cur: 0, rounds: 0, tried: 0 })

/** The current item is done: moves to the next, counting a round at the end and stopping there unless it loops. */
export function advance(c: Custody): Custody {
  const base = { ...c, launched: false, seen: false, tried: 0 }
  if (c.cur + 1 < c.queue.length) return { ...base, cur: c.cur + 1 }
  return { ...base, cur: 0, rounds: c.rounds + 1, running: c.loop && c.running }
}

/** What the custody driver should do this tick. */
export type Step = 'idle' | 'launch' | 'wait' | 'advance'

/**
 * `busy`: an activity is running; `can`: custody may act at all (sweetheart on, growth not paused); `now`: unix ms.
 * A launch that never got going (the pet said why it couldn't) is retried after `retryMs`.
 */
export function step(c: Custody, busy: boolean, can: boolean, now: number, retryMs = 5 * 60_000): Step {
  if (c.launched && c.seen && !busy) return 'advance'
  if (!can || !c.queue.length) return 'idle'
  if (busy) return 'wait'
  if (!c.running) return 'idle'
  if (c.launched && now - c.tried < retryMs) return 'wait'
  return 'launch'
}

/** "当前/下一项" label numbers, 1-based. */
export function position(c: Custody): { cur: number; next: number; total: number } {
  const total = c.queue.length
  if (!total) return { cur: 0, next: 0, total: 0 }
  const next = c.cur + 1 < total ? c.cur + 2 : c.loop ? 1 : 0
  return { cur: c.cur + 1, next, total }
}
