import type { DeviceKind } from './ipc'

/** Pet assets use this size before screen-specific scaling, in CSS pixels. */
export function petSizeFor(level: number, viewport: { width: number; height: number }, touch: boolean, deviceKind?: DeviceKind): number {
  const original = 144 + 2 * Math.min(level, 10)
  if (deviceKind === 'tablet') return original
  return original * (touch ? Math.min(viewport.width, viewport.height) / 360 : viewport.width / 1920)
}

/** Native tablets keep the original toolbar size, shrinking only when it cannot fit. */
export function toolbarScaleFor(size: number, fit: number, touch: boolean, deviceKind?: DeviceKind): number {
  if (deviceKind === 'tablet') return Math.max(0, Math.min(1, fit))
  return touch ? Math.min(size / 150, fit) : 1
}

/** Keep a mobile pet's relative position within its available movement area. */
export function resizePetPosition(
  position: { x: number; y: number },
  previous: { width: number; height: number; size: number },
  next: { width: number; height: number; size: number },
  edge: 'hideleft' | 'hideright' | null = null,
): { x: number; y: number } {
  const maxX = Math.max(0, next.width - next.size)
  const maxY = Math.max(0, next.height - next.size)
  const scale = (value: number, before: number, after: number): number =>
    (before > 0 ? Math.min(1, Math.max(0, value / before)) : 0.5) * after
  return {
    x: edge === 'hideleft' ? 0 : edge === 'hideright' ? maxX : scale(position.x, previous.width - previous.size, maxX),
    y: scale(position.y, previous.height - previous.size, maxY),
  }
}
