// Drag paging for the interaction panels: the strip of pages follows the finger, neighbours and all, and the release
// snaps to the page it is closest to. The triangles stay as they are — both end up in the same `go`.

/** Fraction of the page the finger must travel (in slow motion) before the release turns it. */
const TURN_RATIO = 0.3
/** Release speed (CSS px per ms) that turns the page even when the drag stopped near the current one. */
const FLING = 0.35

/**
 * The page a release lands on. `dx` is the drag offset and `width` the page width, both in the same unit (the strip's
 * on-screen pixels — the toolbar is scaled on a phone, so element pixels would not match). Positive `dx` means the
 * finger moved right, which reveals the page before.
 */
export function snapPage(dx: number, width: number, velocity: number, page: number, total: number): number {
  const travel = width > 0 ? -dx / width : 0
  // A flick counts even when the finger barely moved; otherwise the page turns once it is a third of the way.
  const step = Math.abs(travel) >= TURN_RATIO ? Math.sign(travel) : Math.abs(velocity) >= FLING ? (velocity < 0 ? 1 : -1) : 0
  return Math.min(Math.max(page + step, 1), Math.max(total, 1))
}

/**
 * Offset to draw while dragging: past the first or last page the strip only moves a third of the way, so the edge
 * feels like a wall instead of a page that can be dragged into empty space.
 */
export function rubberBand(dx: number, atStart: boolean, atEnd: boolean): number {
  return (dx > 0 && atStart) || (dx < 0 && atEnd) ? dx * 0.35 : dx
}
