import { cover, hitCover, coverageTiming, resetCoverage, type Box } from '../mobile/overlay'
import type { IOSRPC } from './rpc'

// The real frame clock: the SWF player holds page animation frames while the host is paused (#119), and the
// surface must still follow a menu or panel opened from the manager while the pet is hidden. Prefer window's
// copy (captured before the pause wrapper); fall back to the free global for the iOS runtime tests' vm.
const raf = (
  typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame
    : requestAnimationFrame
).bind(typeof window !== 'undefined' ? window : globalThis)

export interface Rect { x: number; y: number; width: number; height: number }
export interface PetPointer { phase: 'begin' | 'move' | 'end' | 'cancel'; id: number; x: number; y: number; time?: number }
interface GeometryTiming { framesPerSecond: number; lastFrameAgoMs: number | null; maxFrameGapMs: number; readbackFailures: number; lastReadbackMs: number | null }

const rect = (box: Box): Rect => ({ x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top })
const visible = (element: Element): boolean => {
  const box = element.getBoundingClientRect()
  if (!box.width || !box.height) return false
  for (let parent: Element | null = element; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
  }
  return true
}

/** Full page CSS coordinates remain fixed while the native surface is cropped. */
export function startGeometry(rpc: IOSRPC): { pointer(input: PetPointer): void; pause(paused: boolean): void; stop(): void; bounds(): Rect; timing(): GeometryTiming } {
  const presses = new Map<number, { x: number; y: number }>()
  let dragging = false
  let stopped = false
  let paused = Boolean(window.__qqpetHostPaused)
  let frame = 0
  let previous = ''
  let bounds: Rect = { x: 0, y: 0, width: 0, height: 0 }
  let lastFrame: number | null = null
  let sampleStart = performance.now()
  let sampleFrames = 0
  let framesPerSecond = 0
  let maxFrameGapMs = 0
  // Paused the page rarely changes: measure seldom, but at once after a menu or panel appears.
  const PAUSED_MS = 1000
  const BUSY_MS = 2000
  let busyUntil = 0
  let measured = 0
  for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) document.addEventListener(type, () => (busyUntil = performance.now() + BUSY_MS), true)
  // The iOS runtime tests run geometry in a vm without MutationObserver; production always has it.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => (busyUntil = performance.now() + BUSY_MS)).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] })
  }

  const pointer = (input: PetPointer): void => {
    if (input.phase === 'cancel' && input.id === -1) { presses.clear(); dragging = false }
    else if (input.phase === 'begin') presses.set(input.id, { x: input.x, y: input.y })
    else if (input.phase === 'move') {
      const press = presses.get(input.id)
      if (press && Math.hypot(input.x - press.x, input.y - press.y) > 6) dragging = true
    } else {
      presses.delete(input.id)
      if (!presses.size) dragging = false
    }
  }
  const phases = { pointerdown: 'begin', pointermove: 'move', pointerup: 'end', pointercancel: 'cancel' } as const
  const fromDOM = (event: PointerEvent): void => pointer({ phase: phases[event.type as keyof typeof phases], id: event.pointerId, x: event.clientX, y: event.clientY })
  for (const type of Object.keys(phases)) document.addEventListener(type, fromDOM as EventListener, true)

  const track = (): void => {
    if (stopped) return
    frame = raf(track)
    const now = performance.now()
    // Keep the loop alive while paused (native raf); only skip the heavy measure until something changes.
    if (paused && !dragging && now >= busyUntil && now - measured < PAUSED_MS) return
    measured = now
    if (lastFrame !== null) maxFrameGapMs = Math.max(maxFrameGapMs, now - lastFrame)
    lastFrame = now
    sampleFrames++
    if (now - sampleStart >= 1000) {
      framesPerSecond = Math.round(sampleFrames * 10000 / (now - sampleStart)) / 10
      sampleStart = now
      sampleFrames = 0
    }
    let left = innerWidth, top = innerHeight, right = 0, bottom = 0
    const dragRegions: Rect[] = []
    for (const element of document.body.querySelectorAll('*')) {
      let box: Box | null
      try { box = cover(element) } catch {
        // An unreadable WebGL buffer keeps a conservative rectangle, never disables the host.
        box = visible(element) ? element.getBoundingClientRect() : null
      }
      // Only the front/back pet movies and its equipped background are drag
      // targets. Decorative mood movies must not turn their blank box into one.
      if (element.id === 'pet' || (element.tagName === 'RUFFLE-PLAYER' && element.parentElement?.id === 'pet')) {
        let hit: Box | null = null
        try { hit = hitCover(element) } catch { /* A retiring renderer is not an input target. */ }
        if (hit) dragRegions.push(rect(hit))
      }
      if (!box) continue
      left = Math.min(left, box.left); top = Math.min(top, box.top)
      right = Math.max(right, box.right); bottom = Math.max(bottom, box.bottom)
    }
    const x = Math.max(Math.floor(left), 0), y = Math.max(Math.floor(top), 0)
    bounds = dragging ? { x: 0, y: 0, width: innerWidth, height: innerHeight } : {
      x, y,
      width: Math.max(Math.min(Math.ceil(right), innerWidth) - x, 0),
      height: Math.max(Math.min(Math.ceil(bottom), innerHeight) - y, 0),
    }
    const interactiveRegions: Rect[] = []
    // A hit root may be a zero-sized anchor with visible, overflowing children
    // (the pet toolbar). Those controls must also bypass the native drag plane.
    for (const element of document.body.querySelectorAll('[data-hit], [data-hit] *, .point, input, textarea, select, button, iframe, ruffle-player')) {
      if (element.closest('#pet') && !element.matches('.point')) continue
      if (!visible(element) || getComputedStyle(element).pointerEvents === 'none') continue
      interactiveRegions.push(rect(element.getBoundingClientRect()))
    }
    const payload = { bounds, dragRegions, interactiveRegions, viewport: { width: innerWidth, height: innerHeight }, dragging }
    const signature = JSON.stringify(payload)
    if (signature !== previous) {
      rpc.notify('setGeometry', payload)
      previous = signature
      busyUntil = now + BUSY_MS
    }
  }
  frame = raf(track)
  return {
    pointer,
    bounds: () => bounds,
    timing: () => ({ framesPerSecond, lastFrameAgoMs: lastFrame === null ? null : Math.round(performance.now() - lastFrame), maxFrameGapMs: Math.round(maxFrameGapMs), ...coverageTiming() }),
    pause(value) {
      if (paused !== value) {
        resetCoverage()
        lastFrame = null
        sampleStart = performance.now()
        sampleFrames = 0
        framesPerSecond = 0
        maxFrameGapMs = 0
        measured = 0
        busyUntil = performance.now() + BUSY_MS
      }
      paused = value
      if (paused) pointer({ phase: 'cancel', id: -1, x: 0, y: 0 })
    },
    stop() {
      stopped = true
      cancelAnimationFrame(frame)
      for (const type of Object.keys(phases)) document.removeEventListener(type, fromDOM as EventListener, true)
    },
  }
}
