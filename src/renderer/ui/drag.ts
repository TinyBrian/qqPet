type Target = Pick<HTMLElement, 'addEventListener' | 'style'>
type Doc = Pick<Document, 'addEventListener' | 'removeEventListener'>

/**
 * Lets the mouse drag `el` by any part of it but a text field, the way framed windows move (box.ts). The offset goes
 * into the `translate` property, so the element keeps its own position and transform. No pointer capture: it would
 * retarget clicks on buttons inside. Touch screens keep their taps and scrolling.
 */
export function mouseDrag(el: Target, touch: boolean, doc: Doc = document): void {
  if (touch) return
  let dx = 0
  let dy = 0
  el.addEventListener('pointerdown', (e) => {
    const t = e.target as Element | null
    if (e.button !== 0 || t?.closest?.('input, textarea, [contenteditable="true"]')) return
    const sx = e.clientX - dx
    const sy = e.clientY - dy
    const move = (m: PointerEvent): void => {
      dx = m.clientX - sx
      dy = m.clientY - sy
      el.style.translate = `${dx}px ${dy}px`
    }
    doc.addEventListener('pointermove', move)
    doc.addEventListener('pointerup', () => doc.removeEventListener('pointermove', move), { once: true })
  })
}
