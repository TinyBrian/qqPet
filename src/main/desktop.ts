import type { DesktopCursor, Point } from '../shared/ipc'

/**
 * How long the overlay stays blank while the window is moved to another display. The new position is composited a
 * few frames late and that mismatched frame is the flicker, so this has to outlast it; too long and the pet visibly
 * disappears, too short and the flash comes back. Tune here.
 */
const CROSS_DISPLAY_BLANK_MS = 100

interface Rect extends Point { width: number; height: number }
interface Display { id: number; workArea: Rect; bounds?: Rect }
interface Desktop {
  getAllDisplays(): Display[]
  getPrimaryDisplay(): Display
  getDisplayNearestPoint(point: Point): Display
  getCursorScreenPoint(): Point
}
interface Overlay {
  getBounds(): Rect
  setBounds(bounds: Rect): void
  /** Hides the overlay while a cross-display move is being composited. Absent in tests and older shells. */
  setOpacity?(value: number): void
}

/**
 * Where the overlay goes on a display. On Windows an auto-hidden taskbar leaves a one-pixel sliver at the screen edge,
 * and hovering it only brings the taskbar up while no topmost window covers that row (#37); the work area then reaches
 * the screen edge, so the overlay stops one pixel short of every edge the work area shares with the screen.
 */
export function overlayArea(display: Display, insetScreenEdges: boolean): Rect {
  const area = display.workArea
  const screen = display.bounds
  if (!insetScreenEdges || !screen) return area
  const left = area.x <= screen.x ? 1 : 0
  const top = area.y <= screen.y ? 1 : 0
  const right = area.x + area.width >= screen.x + screen.width ? 1 : 0
  const bottom = area.y + area.height >= screen.y + screen.height ? 1 : 0
  return { x: area.x + left, y: area.y + top, width: area.width - left - right, height: area.height - top - bottom }
}

export const petDisplay = (desktop: Desktop, id: number | null): Display =>
  desktop.getAllDisplays().find((display) => display.id === id) ?? desktop.getPrimaryDisplay()

/** Keep one overlay on the active display; Electron's DIP coordinates become page pixels at the page zoom. */
export function desktopCursor(
  win: Overlay,
  desktop: Desktop,
  initialId: number,
  pageZoom = (): number => 1,
  placement = (display: Display): Rect => display.workArea,
): (follow: boolean) => DesktopCursor {
  const origin = win.getBounds()
  let id = initialId
  let sequence = 0
  /** Pending "show the overlay again" timer for a cross-display move. */
  let reveal: ReturnType<typeof setTimeout> | null = null
  return (follow) => {
    const zoom = pageZoom()
    const cursor = desktop.getCursorScreenPoint()
    const display = follow ? desktop.getDisplayNearestPoint(cursor) : petDisplay(desktop, id)
    const crossed = display.id !== id
    id = display.id
    const before = win.getBounds()
    const area = placement(display)
    const moved = before.x !== area.x || before.y !== area.y || before.width !== area.width || before.height !== area.height
    if (moved && crossed) {
      // Moving the window to another display is composited a few frames later: for that moment the window is at the
      // new place while the page still draws for the old origin, which reads as the pet flashing. Hide the overlay for
      // CROSS_DISPLAY_BLANK_MS; the reveal is debounced, so dragging back and forth across the boundary keeps it
      // hidden until the move settles instead of strobing. Only a real display change does this, so dragging inside
      // one screen stays completely seamless.
      if (win.setOpacity) {
        win.setOpacity(0)
        if (reveal) clearTimeout(reveal)
        reveal = setTimeout(() => {
          reveal = null
          win.setOpacity?.(1)
        }, CROSS_DISPLAY_BLANK_MS)
      }
      win.setBounds(area)
    } else if (moved) win.setBounds(area)
    // A fresh setBounds is not on screen yet and getBounds can still report the old rectangle, which made the pet
    // flash at the previous display's position for a frame while it was dragged across monitors.
    const bounds = moved ? area : win.getBounds()
    return {
      x: (cursor.x - bounds.x) / zoom,
      y: (cursor.y - bounds.y) / zoom,
      desktop: {
        id, width: bounds.width / zoom, height: bounds.height / zoom,
        offset: { x: (origin.x - bounds.x) / zoom, y: (origin.y - bounds.y) / zoom },
        zoom,
        sequence: ++sequence,
      },
    }
  }
}
