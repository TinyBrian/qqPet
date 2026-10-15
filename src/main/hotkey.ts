// The talk key: a global hotkey read by polling GetAsyncKeyState through koffi,
// so it works whatever window has focus. Trimmed from Cortico's desktop-pet
// world hotkey.ts (Pal-AI-Lab, GPL-3.0-compatible use in this GPL-3.0 project):
// `LeftAlt*2` is a quick tap of left Alt, then the hold that follows — hold to
// talk, release to send. Polling is a few syscalls a second, effectively free.

import { createRequire } from 'node:module'

export { DEFAULT_HOTKEY, hotkeyLabel } from '../shared/hotkey'

const NAMED: Record<string, number> = {
  Ctrl: 0x11, LeftCtrl: 0xa2, RightCtrl: 0xa3,
  Alt: 0x12, LeftAlt: 0xa4, RightAlt: 0xa5,
  Shift: 0x10, LeftShift: 0xa0, RightShift: 0xa1,
  Win: 0x5b, RightWin: 0x5c,
  Space: 0x20, Tab: 0x09, CapsLock: 0x14, Backquote: 0xc0, Enter: 0x0d,
  Insert: 0x2d, Delete: 0x2e, Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22,
  Mouse3: 0x04, Mouse4: 0x05, Mouse5: 0x06,
}

export interface Hotkey {
  /** Virtual-key codes, all down together. */
  keys: number[]
  /** Presses it takes: the last one is held, the ones before are quick taps. */
  taps: number
}

/** The keys and press count of `hotkey`, or null when a name is unknown. */
export function parseHotkey(hotkey: string): Hotkey | null {
  const m = /^(.*?)\s*\*\s*([1-3])$/.exec(hotkey.trim())
  const combo = m ? m[1]! : hotkey.trim()
  const taps = m ? Number(m[2]) : 1
  const parts = combo.split('+').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  const codes: number[] = []
  for (const p of parts) {
    let vk: number | undefined = NAMED[p]
    if (vk === undefined && /^[A-Z0-9]$/.test(p)) vk = p.charCodeAt(0)
    const fn = /^F([1-9]|1\d|2[0-4])$/.exec(p)
    if (vk === undefined && fn) vk = 0x6f + Number(fn[1])
    if (vk === undefined) return null
    codes.push(vk)
  }
  return { keys: codes, taps }
}

/** Longest press that still counts as a tap before the held one. */
export const TAP_MAX_MS = 300
/** Longest pause between a tap's release and the next press (Windows double-click time minus a tap). */
export const TAP_GAP_MS = 400

/**
 * Turns raw key ups and downs into the hotkey's: with taps, the key is down
 * only from the last press of a quick sequence. `onTap` gets each finished tap.
 */
export function tapTracker(taps: number, onChange: (down: boolean) => void, onTap: (count: number) => void = () => {}) {
  let count = 0, lastUp = 0, pressAt = 0, active = false
  return (down: boolean, now: number): void => {
    if (down) {
      if (count && now - lastUp > TAP_GAP_MS) count = 0
      if (count === taps - 1) {
        count = 0
        active = true
        onChange(true)
        return
      }
      pressAt = now
      return
    }
    if (active) {
      active = false
      onChange(false)
      return
    }
    if (now - pressAt <= TAP_MAX_MS) {
      count++
      lastUp = now
      onTap(count)
    } else count = 0
  }
}

export interface KeyWatcher {
  stop(): void
}

/**
 * Calls `onChange` on every press and release of `hotkey`; resolves to the
 * reason instead of a watcher when the keys cannot be read.
 */
export async function watchHotkey(
  hotkey: Hotkey,
  onChange: (down: boolean) => void,
  pollMs = 30,
  onTap?: (count: number) => void,
): Promise<KeyWatcher | string> {
  if (process.platform !== 'win32') return '语音热键目前只支持 Windows'
  let getKey: (vk: number) => number
  try {
    const koffi = (createRequire(import.meta.url)('koffi') as typeof import('koffi')).default
    getKey = koffi.load('user32.dll').func('short __stdcall GetAsyncKeyState(int vKey)') as (vk: number) => number
  } catch (err) {
    return `无法读取键盘：${(err as Error).message}`
  }
  const { keys, taps } = hotkey
  const step = tapTracker(taps, onChange, onTap)
  let down = false
  const timer = setInterval(() => {
    const now = keys.every((vk) => (getKey(vk) & 0x8000) !== 0)
    if (now === down) return
    down = now
    step(now, Date.now())
  }, pollMs)
  return { stop: () => clearInterval(timer) }
}
