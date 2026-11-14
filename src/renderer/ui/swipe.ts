// Drag/swipe paging for the interaction panels: the row follows the finger, and the release decides whether the
// page turns. The triangles stay as they are — both end up in the same `turn`.

/** Travel (CSS px) that counts as a swipe when the finger was slow. */
const MIN_TRAVEL = 28
/** Fraction of the row width that also counts, so a wide row needs a wider swipe. */
const TRAVEL_RATIO = 0.16
/** Release speed (CSS px per ms) that turns the page regardless of how far it got. */
const FLING = 0.35

/**
 * Which way a release turns the page: -1 previous, 1 next, 0 snap back. `dx` is the drag offset in CSS px, positive
 * when the finger moved right (which reveals the previous page).
 */
export function swipePage(dx: number, width: number, velocity: number): -1 | 0 | 1 {
  const travel = Math.max(MIN_TRAVEL, width * TRAVEL_RATIO)
  if (Math.abs(dx) >= travel) return dx < 0 ? 1 : -1
  if (Math.abs(velocity) >= FLING) return velocity < 0 ? 1 : -1
  return 0
}

/**
 * Offset to draw while dragging: past the first or last page the row only moves a third of the way, so the edge
 * feels like a wall instead of a page that can be swiped into empty space.
 */
export function rubberBand(dx: number, atStart: boolean, atEnd: boolean): number {
  return (dx > 0 && atStart) || (dx < 0 && atEnd) ? dx * 0.35 : dx
}
