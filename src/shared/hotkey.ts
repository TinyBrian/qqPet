/** The talk key and its name for people. Pure text, so the renderer may use it too. */

/** The talk key: a quick tap of left Alt, then the hold that talks. */
export const DEFAULT_HOTKEY = 'LeftAlt*2'

const NAMES: Record<string, string> = {
  Ctrl: 'Ctrl', LeftCtrl: '左Ctrl', RightCtrl: '右Ctrl',
  Alt: 'Alt', LeftAlt: '左Alt', RightAlt: '右Alt',
  Shift: 'Shift', LeftShift: '左Shift', RightShift: '右Shift',
  Win: 'Win', Space: '空格', Enter: '回车', Tab: 'Tab', CapsLock: '大写键',
  Backquote: '`', Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End',
  PageUp: 'PgUp', PageDown: 'PgDn', Mouse3: '中键', Mouse4: '侧键4', Mouse5: '侧键5',
}

/** `LeftAlt*2` → `双击左Alt`; `Ctrl+Space` → `Ctrl+空格`. */
export function hotkeyLabel(hotkey: string): string {
  const m = /^(.*?)\s*\*\s*([1-3])$/.exec(hotkey.trim())
  const combo = (m ? m[1]! : hotkey.trim()).split('+').map((p) => NAMES[p.trim()] ?? p.trim()).join('+')
  return m ? `${['', '单击', '双击', '三击'][Number(m[2])]}${combo}` : combo
}
