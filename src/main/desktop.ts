import type { DesktopCursor, Point } from '../shared/ipc'

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
  return (follow) => {
    const zoom = pageZoom()
    const cursor = desktop.getCursorScreenPoint()
    const display = follow ? desktop.getDisplayNearestPoint(cursor) : petDisplay(desktop, id)
    id = display.id
    const before = win.getBounds()
    const area = placement(display)
    if (before.x !== area.x || before.y !== area.y || before.width !== area.width || before.height !== area.height) win.setBounds(area)
    const bounds = win.getBounds()
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
