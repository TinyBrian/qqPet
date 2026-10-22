import { goodOf } from '../pet/data/goods'
import { onGoodsChange } from '../pet/goods'
import { save } from '../pet/store'

const petEl = document.getElementById('pet')!

/** Peek SWFs only draw a sliver; the original hid the scene so just the pet peeks from the edge. */
let peeking = false

/** The equipped scene sits behind the transparent action players and moves with the pet. */
function draw(): void {
  const bg = save.selfGoodUseOption.background
  petEl.style.backgroundImage =
    !peeking && bg && bg.left > 0 && bg.id !== 'b0000000' ? `url("${goodOf('background', bg.id).url}")` : ''
}

/** Hide or restore the equipped scene when the pet slips into or out of an edge peek. */
export function setBackgroundPeeking(on: boolean): void {
  if (peeking === on) return
  peeking = on
  draw()
}

draw()
onGoodsChange((type) => {
  if (type === 'background') draw()
})
