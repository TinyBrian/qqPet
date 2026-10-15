/** A friend's pet visits: the newer client's interact2/102_102 two-pet clips (300×200 stage). */
export const VISIT_DIR = 'pet/interact2/102_102/'
export const VISIT_STAGE = { w: 300, h: 200 }

export interface VisitStep {
  clip: string
  /** How long the step lasts; multi-frame clips use their length at 12 fps. */
  ms: number
  /** Our dialogue drawn into the two speech bubbles (left = friend, right = our pet). */
  talk?: [string, string]
}

const FPS = 12
const frames = (n: number): number => Math.ceil((n / FPS) * 1000)

export const VISIT_TALK: [string, string][] = [
  ['嗨！我来找你玩啦~', '太好啦，快进来！'],
  ['你家好漂亮呀！', '嘿嘿，[host]帮我收拾的~'],
  ['我们来比力气吧！', '好呀，我可不会输哦！'],
  ['给你带了好吃的~', '谢谢你，好朋友！'],
]

/** enter → idle with a line of dialogue → tug of war or a shared meal. `roll` picks both, in [0, 1). */
export function visitSteps(roll: number): VisitStep[] {
  const talk = VISIT_TALK[Math.trunc(roll * VISIT_TALK.length)]
  const main: VisitStep = roll < 0.5 ? { clip: 'tugofwar.swf', ms: 8000 } : { clip: 'feed.swf', ms: frames(222) }
  return [{ clip: 'enter.swf', ms: frames(84) }, { clip: 'idle.swf', ms: 6000, talk }, main, { clip: 'idle.swf', ms: 3000, talk: ['玩得真开心，下次见！', '拜拜~常来玩哦！'] }]
}

/** The scene box, scaled with the pet (whose clips are 140 px), standing where the pet stands and kept on screen. */
export function visitBox(pet: { left: number; bottom: number; width: number }, screenW: number): { x: number; y: number; w: number; h: number } {
  const w = Math.round((pet.width * VISIT_STAGE.w) / 140)
  const h = Math.round((w * VISIT_STAGE.h) / VISIT_STAGE.w)
  const x = Math.min(Math.max(Math.round(pet.left + pet.width / 2 - w / 2), 0), Math.max(screenW - w, 0))
  return { x, y: Math.round(pet.bottom - h), w, h }
}

/** Bubble text areas in stage pixels, measured from a Ruffle render of idle.swf (bubbles ~17-145 / 155-283, y ~12-88). */
export const BUBBLES = [
  { x: 22, y: 18, w: 118, h: 64 },
  { x: 160, y: 18, w: 118, h: 64 },
]
