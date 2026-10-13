/** Safari 14 equivalent for the visibility checks used by overlay cropping. */
export function visibleContent(el: Element): boolean {
  const view = el.ownerDocument.defaultView
  if (!view) return false
  const box = el.getBoundingClientRect()
  if (!box.width || !box.height) return false
  const own = view.getComputedStyle(el)
  if (own.visibility === 'hidden' || own.visibility === 'collapse') return false
  let ancestor: Element | null = el
  while (ancestor) {
    const style = view.getComputedStyle(ancestor)
    if (style.display === 'none' || Number(style.opacity) === 0) return false
    const root = ancestor.getRootNode() as ShadowRoot
    ancestor = ancestor.parentElement ?? root.host ?? null
  }
  return true
}
