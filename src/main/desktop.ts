import type { DesktopCursor, Point } from '../shared/ipc'

interface Rect extends Point { width: number; height: number }
interface Display { id: number; workArea: Rect }
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

export const petDisplay = (desktop: Desktop, id: number | null): Display =>
  desktop.getAllDisplays().find((display) => display.id === id) ?? desktop.getPrimaryDisplay()

/** Keep one overlay on the active display; Electron's DIP coordinates become page pixels at the page zoom. */
export function desktopCursor(
  win: Overlay,
  desktop: Desktop,
  initialId: number,
  pageZoom = (): number => 1,
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
    const area = display.workArea
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
