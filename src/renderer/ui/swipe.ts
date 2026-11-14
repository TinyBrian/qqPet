// Drag paging for the interaction panels: the strip of pages follows the finger, neighbours and all, and the release
// snaps to the page it is closest to. The triangles stay as they are — both end up in the same `go`.

/** Release speed (CSS px per ms) that turns the page even when the drag stopped near the current one. */
const FLING = 0.35

/**
 * The page a release lands on: the nearest one to where the drag stopped, or one further when the finger was still
 * moving fast. `dx` is the drag offset in CSS px, positive when the finger moved right (revealing the page before).
 */
export function snapPage(dx: number, width: number, velocity: number, page: number, total: number): number {
  // Round away from zero on both sides: Math.round(-0.5) is -0, so a drag to the right would need twice the
  // distance of one to the left before the page turned.
  const raw = width > 0 ? -dx / width : 0
  const pages = Math.sign(raw) * Math.round(Math.abs(raw))
  const fling = pages === 0 && Math.abs(velocity) >= FLING ? (velocity < 0 ? 1 : -1) : 0
  return Math.min(Math.max(page + pages + fling, 1), Math.max(total, 1))
}

/**
 * Offset to draw while dragging: past the first or last page the strip only moves a third of the way, so the edge
 * feels like a wall instead of a page that can be dragged into empty space.
 */
export function rubberBand(dx: number, atStart: boolean, atEnd: boolean): number {
  return (dx > 0 && atStart) || (dx < 0 && atEnd) ? dx * 0.35 : dx
}
