import type { Sex } from '../../shared/save'
import type { Stage } from './level'

export type Mood = 'happy' | 'peaceful' | 'upset' | 'sad'

export interface PoseOpt {
  /** Only these actions may follow; anything else is dropped. */
  afterState?: string[]
  /** Freeze the animation on this frame. */
  overCurrentFrame?: number
}

/** `<name><n>.swf` with n random in [start, end] unless notNum, else `<name>.swf`. */
interface Route {
  name: string
  start?: number
  end?: number
  notNum?: boolean
  opt?: PoseOpt
}

export interface Target {
  url: string
  opt: { opt?: PoseOpt }
}

type Range = { end?: number; notNum?: boolean }
type Table = Record<string, Route>

function common(o: { enter?: Range; eat?: Range; exit?: Range; clean?: Range; sick?: Range; cure?: Range; bury: number }): Table {
  return {
    enter: { name: 'Enter', start: 1, end: o.enter?.end ?? 3 },
    clean: { name: 'Clean', start: 1, end: 2, notNum: o.clean?.notNum },
    eat: { name: 'Eat', start: 1, end: o.eat?.end ?? 2 },
    first: { name: 'First' },
    levUp: { name: 'LevUp' },
    exit: { name: 'Exit', start: 1, end: o.exit?.end ?? 4 },
    sick: { name: 'Sick', start: 1, end: 2, notNum: o.sick?.notNum },
    die: { name: 'Die', opt: { afterState: ['revival', 'bury'] } },
    revival: { name: 'Revival' },
    bury: { name: 'Bury', opt: { afterState: [], overCurrentFrame: o.bury } },
    dying: { name: 'Dying', opt: { afterState: ['dying', 'die', 'cure', 'revival', 'bury', 'hide', 'appear'] } },
    cure: { name: 'Cure', start: 1, end: 2, notNum: o.cure?.notNum },
    hideleft: { name: 'Hide_left', start: 1, end: 1 },
    hideright: { name: 'Hide_right', start: 1, end: 1 },
    hungry: { name: 'Hungry' },
    dirty: { name: 'Dirty' },
    poor: { name: 'Poor' },
  }
}

function moodActions(play: number, speak: Range = { notNum: true }): Table {
  return {
    normal: { name: 'Stand' },
    // The shared drag.swf is adult-only; younger pets hold their standing pose while dragged.
    drag: { name: 'Stand' },
    play: { name: 'play/P', start: 1, end: play },
    speak: { name: 'Speak', start: 1, end: speak.end ?? 1, notNum: speak.notNum },
    hide: { name: 'Hide' },
    appear: { name: 'Appear' },
  }
}

/**
 * Per-pet action content, kept as plain data so it can later move into the content pack (#28).
 * Paths are relative to `pet/Action/<sex>/<stage>/`, without `.swf`. A missing entry keeps the default clip.
 */
export interface ActionData {
  /** Numbered idle plays: Egg/Kid `play/P1..n`, Adult `peaceful/play/P1..n`. */
  play: { egg: number; kid: number; peaceful: number }
  /** Alternatives picked at random for an action key (`walk_left`, `walk_right`, `drag`, `dirty`, `poor`). */
  variants: Partial<Record<Stage, Record<string, string[]>>>
}

const walks = (n: number): Record<string, string[]> => ({
  walk_left: Array.from({ length: n }, (_, i) => `walk/walk_left${i ? i + 1 : ''}`),
  walk_right: Array.from({ length: n }, (_, i) => `walk/walk_right${i ? i + 1 : ''}`),
})

const DRAG = (ids: number[]): string[] => ids.map((i) => `motion/drag${i}101213`)

export const ACTIONS: Record<Sex, ActionData> = {
  // GG has the newer client's extra clips (#25).
  GG: {
    play: { egg: 47, kid: 127, peaceful: 127 },
    variants: {
      Egg: { ...walks(2), drag: DRAG([1, 2, 3]) },
      Kid: { ...walks(3), drag: DRAG([1, 3]), dirty: ['Dirty', 'lead/dirty20110805'], poor: ['Poor', 'lead/poor20110826'] },
      Adult: walks(3),
    },
  },
  MM: { play: { egg: 29, kid: 111, peaceful: 100 }, variants: {} },
}

const KID = { exit: { end: 3 }, eat: { end: 1 }, clean: { notNum: true }, sick: { notNum: true }, cure: { notNum: true } }
const EGG = { enter: { end: 2 }, exit: { end: 3 }, clean: { notNum: true }, sick: { notNum: true }, cure: { notNum: true } }

const MOOD_PLAY: Record<Mood, number> = { happy: 47, peaceful: 100, upset: 23, sad: 22 }

type PlayCount = ActionData['play']

type Tables = Record<Stage, Table>

const tables = (adultBury: number, play: PlayCount): Tables => ({
  Adult: common({ bury: adultBury }),
  Kid: { ...common({ ...KID, bury: 134 }), ...moodActions(play.kid) },
  Egg: { ...common({ ...EGG, bury: 140 }), ...moodActions(play.egg, { end: 3 }) },
})

const TABLES: Record<Sex, Tables> = { GG: tables(76, ACTIONS.GG.play), MM: tables(142, ACTIONS.MM.play) }
const adultMoods = (sex: Sex) =>
  Object.fromEntries(
    Object.entries(MOOD_PLAY).map(([m, n]) => [m, moodActions(m === 'peaceful' ? ACTIONS[sex].play.peaceful : n)]),
  ) as Record<Mood, Table>
const ADULT_MOODS: Record<Sex, Record<Mood, Table>> = { GG: adultMoods('GG'), MM: adultMoods('MM') }

/** Adult animations for these live in a per-mood directory. */
const BY_MOOD = ['normal', 'drag', 'play', 'speak', 'appear', 'hide']

export function route(sex: Sex, stage: Stage, action: string, mood: Mood): Target {
  let dir = `pet/Action/${sex}/${stage}/`
  let routes: Table = TABLES[sex][stage]
  if (stage === 'Adult' && BY_MOOD.includes(action)) {
    routes = ADULT_MOODS[sex][mood]
    dir += `${mood}/`
  }
  const r = routes[action]
  const alt = stage === 'Adult' && BY_MOOD.includes(action) ? null : variant(sex, stage, action)
  if (alt) return { url: `${dir}${alt}.swf`, opt: r }
  const n = r.start && r.end && !r.notNum ? Math.trunc(Math.random() * r.end + r.start) : ''
  return { url: `${dir}${r.name}${n}.swf`, opt: r }
}

/** A random alternative clip (relative to the stage directory), or null when this pet has none. */
export function variant(sex: Sex, stage: Stage, key: string, pick: (n: number) => number = (n) => Math.trunc(Math.random() * n)): string | null {
  const list = ACTIONS[sex].variants[stage]?.[key]
  return list?.length ? list[pick(list.length)] : null
}

/** Walk cycle for a direction; GG has extra gait variants. */
export function walkUrl(sex: Sex, stage: Stage, dir: 'left' | 'right'): string {
  return `pet/Action/${sex}/${stage}/${variant(sex, stage, `walk_${dir}`) ?? `walk/walk_${dir}`}.swf`
}
