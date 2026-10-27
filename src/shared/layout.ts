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

/**
 * How far the drawn pet sits inside its stage box, in CSS pixels. The box is the SWF stage: an
 * egg fills about half of it, the hide clips hang off one side, and the rest draws nothing. Only
 * the drawn part counts as the pet's position on screen.
 */
export interface PetInsets {
  left: number
  right: number
  top: number
  bottom: number
}

export const PET_INSETS_NONE: PetInsets = { left: 0, right: 0, top: 0, bottom: 0 }

/** Peek when the drawn pet, not the transparent room around it, comes close to a side. */
export function edgeOfVisible(
  box: { x: number; size: number },
  inset: PetInsets,
  viewportWidth: number,
  margin: number,
): 'hideleft' | 'hideright' | null {
  if (box.x + inset.left <= margin) return 'hideleft'
  if (box.x + box.size - inset.right >= viewportWidth - margin) return 'hideright'
  return null
}

/** Keep the drawn pet inside the viewport; the stage box may overhang a side by its empty room. */
export function clampVisible(
  position: { x: number; y: number },
  size: number,
  inset: PetInsets,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const between = (value: number, min: number, max: number): number => {
    const clamped = Math.min(Math.max(value, min), max)
    // A pet pushed past a side clamps onto -0, which the save would keep as a signed zero.
    return clamped === 0 ? 0 : clamped
  }
  const minX = -inset.left
  const minY = -inset.top
  return {
    x: between(position.x, minX, Math.max(minX, viewport.width - size + inset.right)),
    y: between(position.y, minY, Math.max(minY, viewport.height - size + inset.bottom)),
  }
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
