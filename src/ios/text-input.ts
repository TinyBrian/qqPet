import type { IOSRPC } from './rpc'

/** A HUD has no keyboard scene; native system input keeps the manager in the background. */
export function installTextInput(rpc: IOSRPC, prepare: () => Promise<void>, failed: (error: unknown) => void): () => void {
  let editing = false
  let disposed = false
  let editor: AbortController | undefined
  const focus = (event: FocusEvent): void => {
    const element = event.composedPath()[0]
    if (editing || !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) || element.disabled || element.readOnly) return
    if (element instanceof HTMLInputElement && !['text', 'search', 'url', 'email', 'tel', 'password', 'number'].includes(element.type)) return
    editing = true
    const controller = new AbortController()
    editor = controller
    const ruffle = element.id === 'virtual-keyboard'
    // The system alert owns the keyboard. Release WK's input focus so it does
    // not ask the background HUD for a keyboard and the field can be edited again.
    element.blur()
    void (async () => {
      await prepare()
      if (disposed || controller.signal.aborted || !element.isConnected) return
      const value = await rpc.request<string | null>('editText', {
        text: element.value, placeholder: element.placeholder, secure: element instanceof HTMLInputElement && element.type === 'password',
        type: element instanceof HTMLInputElement ? element.type : 'text', maxLength: element.maxLength,
      }, { timeout: 0, signal: controller.signal })
      if (disposed || controller.signal.aborted || value === null || !element.isConnected) return
      if (typeof value !== 'string') throw new Error('The native editor returned invalid text.')
      const text = element.maxLength >= 0 ? value.slice(0, element.maxLength) : value
      element.focus()
      element.value = text
      // Ruffle reads committed input data and clears its hidden keyboard field.
      element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }))
      if (!ruffle) element.dispatchEvent(new Event('change', { bubbles: true }))
    })().catch((error) => { if (!controller.signal.aborted) failed(error) }).finally(() => {
      if (document.activeElement === element) element.blur()
      if (editor === controller) editor = undefined
      editing = false
    })
  }
  document.addEventListener('focusin', focus, true)
  return () => {
    disposed = true
    document.removeEventListener('focusin', focus, true)
    editor?.abort()
  }
}
