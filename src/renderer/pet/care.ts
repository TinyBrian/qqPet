import type { Good } from './data/goods'

/**
 * The good that wastes least of its effect on `stat` with `deficit` points missing: the biggest one that still
 * fits, otherwise the one that overflows least. Goods that do nothing for the stat are never picked.
 */
export function pickCare<G extends Pick<Good, 'hunger' | 'clean' | 'mood'>>(goods: G[], stat: 'hunger' | 'clean' | 'mood', deficit: number): G | undefined {
  let fit: G | undefined
  let over: G | undefined
  for (const g of goods) {
    const v = g[stat] ?? 0
    if (v <= 0) continue
    if (v <= deficit) {
      if (!fit || v > (fit[stat] ?? 0)) fit = g
    } else if (!over || v < (over[stat] ?? 0)) over = g
  }
  return fit ?? over
}

/** 贴心宝贝自动照顾 (#116): below `<stat>`% the pet tends itself, with the chosen good (`''` picks the least wasteful). */
export interface CareConfig {
  on: boolean
  hunger: number
  clean: number
  mood: number
  food: string
  cleanGood: string
  toy: string
}

export const DEFAULT_CARE: CareConfig = { on: true, hunger: 60, clean: 60, mood: 60, food: '', cleanGood: '', toy: '' }

export function parseCare(raw: string | undefined): CareConfig {
  let o: Partial<CareConfig> = {}
  try {
    o = (JSON.parse(raw || '{}') as Partial<CareConfig>) ?? {}
  } catch {
    /* defaults */
  }
  const pct = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : d)
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    on: typeof o.on === 'boolean' ? o.on : true,
    hunger: pct(o.hunger, 60),
    clean: pct(o.clean, 60),
    mood: pct(o.mood, 60),
    food: str(o.food),
    cleanGood: str(o.cleanGood),
    toy: str(o.toy),
  }
}

/** The chosen good when the pet still has it, otherwise the least wasteful one. */
export function chooseCare<G extends Pick<Good, 'hunger' | 'clean' | 'mood'> & { id: string }>(
  goods: G[],
  stat: 'hunger' | 'clean' | 'mood',
  deficit: number,
  chosen: string,
): G | undefined {
  const c = chosen && goods.find((g) => g.id === chosen && (g[stat] ?? 0) > 0)
  return c || pickCare(goods, stat, deficit)
}
