// Drag paging for the interaction panels: a horizontal list of options that follows the finger and, on release,
// snaps to the nearest option (one option per step), with a flick carrying it up to `MAX_FLING` options further.
// The triangles stay as they are — both end up in the same `go`.

/** Release speed (CSS px per ms) that carries the list on even when the finger barely moved. */
const FLING = 0.35
/** Options a flick may add on top of the dragged distance. */
export const MAX_FLING = 3

/**
 * How many options a release moves. `dx` is the drag offset and `pitch` one option's width, both in the strip's
 * on-screen pixels (the toolbar is scaled on a phone, so element pixels would not match). Positive `dx` means the
 * finger moved right, which reveals the options before.
 */
export function snapStep(dx: number, pitch: number, velocity: number, max = MAX_FLING): number {
  const travelled = pitch > 0 ? -dx / pitch : 0
  const whole = Math.sign(travelled) * Math.round(Math.abs(travelled))
  const flick = Math.abs(velocity) >= FLING ? Math.sign(-velocity) * Math.min(Math.ceil(Math.abs(velocity) * 3), max) : 0
  return Math.min(Math.max(whole + flick, -max), max)
}

/**
 * Offset to draw while dragging: past the first or last option the list only moves a third of the way, so the edge
 * feels like a wall instead of a list that can be dragged into empty space.
 */
export function rubberBand(dx: number, atStart: boolean, atEnd: boolean): number {
  return (dx > 0 && atStart) || (dx < 0 && atEnd) ? dx * 0.35 : dx
}
