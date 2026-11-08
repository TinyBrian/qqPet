// Where the overlay window of the mobile bridges goes. Every move of the window
// shows its last frame at the new place before the page redraws (#18): the pet
// shook as its animation drew a few pixels wider or narrower, and jumped when a
// menu opened. The window keeps a margin around the content and stays put while
// the content still fits it without too much empty room.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** CSS pixels kept around the content. */
export const MARGIN = 24

/**
 * The window rectangle for content `need` (left, top, right, bottom; null for none) in a `vw`×`vh` page, given the
 * current one. `shrink` false keeps the current window whenever it still covers the content: while the page is busy,
 * a bubble or menu closing must not move the window (each move blanks the page for a frame or two), so it waits for
 * an idle moment to fit the window back around the content.
 */
export function nextBounds(
  cur: Rect,
  need: { left: number; top: number; right: number; bottom: number } | null,
  vw: number,
  vh: number,
  margin = MARGIN,
  shrink = true,
): Rect {
  if (!need || need.right <= need.left || need.bottom <= need.top) return { x: 0, y: 0, w: 0, h: 0 }
  const l = Math.max(need.left, 0)
  const t = Math.max(need.top, 0)
  const r = Math.min(need.right, vw)
  const b = Math.min(need.bottom, vh)
  if (cur.w > 0 && cur.h > 0) {
    const [cl, ct, cr, cb] = [cur.x, cur.y, cur.x + cur.w, cur.y + cur.h]
    const fits = cl <= l && ct <= t && cr >= r && cb >= b
    if (fits) {
      if (!shrink) return cur
      const room = (gap: number) => gap <= 2 * margin
      if (room(l - cl) && room(t - ct) && room(cr - r) && room(cb - b)) return cur
    }
  }
  const x = Math.max(Math.floor(l - margin), 0)
  const y = Math.max(Math.floor(t - margin), 0)
  return { x, y, w: Math.min(Math.ceil(r + margin), vw) - x, h: Math.min(Math.ceil(b + margin), vh) - y }
}

/**
 * The rectangle the overlay window may take touches in: the content itself, clamped to the page and without the
 * window's margin. The window is deliberately bigger than the pet (and keeps its size while the content still fits,
 * to avoid blank frames), so everything outside this rectangle has to fall through to the app below — otherwise a
 * swipe beside the pet, or the system's edge gesture near a pet that hid at the screen edge, is swallowed.
 */
export function touchRect(
  need: { left: number; top: number; right: number; bottom: number } | null,
  vw: number,
  vh: number,
): Rect | null {
  if (!need) return null
  const l = Math.max(need.left, 0)
  const t = Math.max(need.top, 0)
  const r = Math.min(need.right, vw)
  const b = Math.min(need.bottom, vh)
  if (r <= l || b <= t) return null
  return { x: l, y: t, w: r - l, h: b - t }
}
