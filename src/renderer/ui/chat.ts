import type { AiMessage } from '../../shared/ipc'
import { aiOn, ask, note } from '../pet/ai'
import { listGoods } from '../pet/goods'
import { useItem } from '../pet/items'
import { work, workGoods } from '../pet/jobs'
import { speak } from '../pet/pet'
import { addInfo, info, save, setInfo, update } from '../pet/store'
import { sendLetterTo, lanPeers } from './lan-visit'
import { openBox } from './box'
import './css/chat.css'
import { button, div } from './dom'
import { setHidden } from './menu'

const DO =
  '回复写成：动作 台词。动作只能是 FEED、CLEAN、WORK、HIDE、QUIET、LETTER 或 NONE。FEED=吃背包食物，CLEAN=用清洁用品，WORK=去打工，HIDE=隐身，QUIET=免打扰。不是办事就写 NONE。台词必须写在动作后面，不要只回动作词。主人让你去送信/串门时写成：LETTER:好友名:「口信」台词 —— 好友名只能用在线好友名单里的名字，口信是要带的话（可以为空），台词照常写在后面。'

/** The protocol plus who is online, so LETTER has a real name to pick. */
function doPrompt(): string {
  const names = lanPeers().map((p) => p.name)
  return `${DO}\n${names.length ? `当前在线好友：${names.join('、')}。` : '当前没有好友在线。'}`
}

// Small models also put the action word after the line instead of before it.
const ACT = /\b(FEED|CLEAN|WORK|HIDE|QUIET|NONE)\b[:：]?/i
const LETTER = /^\s*LETTER[:：]\s*([^:：]+?)[:：]\s*(?:「([^」]*)」)?\s*/i

function parse(text: string): { act: string; arg: { name: string; text: string }; say: string } {
  const l = text.match(LETTER)
  if (l) return { act: 'LETTER', arg: { name: l[1].trim(), text: (l[2] ?? '').trim() }, say: text.replace(LETTER, '').replace(/\s+/g, ' ').trim() }
  const m = text.match(ACT)
  return { act: m ? m[1].toUpperCase() : 'NONE', arg: { name: '', text: '' }, say: text.replace(ACT, '').replace(/\s+/g, ' ').trim() }
}

function doAct(act: string, say: string, arg: { name: string; text: string }): void {
  if (act === 'LETTER') {
    sendLetterTo(arg.name, arg.text, say)
    return
  }
  if (act === 'FEED') {
    const g = listGoods('food', 1, 1).list[0]
    if (g) return useItem(g, false, say)
  } else if (act === 'CLEAN') {
    const g = listGoods('clean', 1, 1).list[0]
    if (g) return useItem(g, false, say)
  } else if (act === 'WORK') {
    const g = workGoods()[0]
    // A refusal (ill, busy, level too low) is spoken by work itself; the AI's "off to work" would contradict it.
    if (g) return void work(g)
  } else if (act === 'HIDE' && !save.settings.hidden) {
    speak({ s: say, now: true, ai: false }, 'hide', { end: () => setHidden(true) })
    return
  } else if (act === 'QUIET' && !save.settings.quiet) {
    speak({ s: say, now: true, ai: false }, 'speak', { start: () => update('settings', { quiet: true }) })
    return
  }
  speak({ s: say, now: true, ai: false }, 'speak')
}

/** Cheat codes typed into the chat, e.g. 元宝+100000. Stats with a bar stop at its max. */
const CHEAT = /^(元宝|成长值?|心情|饥饿|饱食|清洁)\s*[+＋]\s*(\d{1,9})$/
const STATS = { 元宝: 'yb', 成长: 'growth', 成长值: 'growth', 心情: 'mood', 饥饿: 'hunger', 饱食: 'hunger', 清洁: 'clean' } as const

function cheat(text: string): string | null {
  if (text === '不要死') {
    update('settings', { undying: true })
    return `好的${info.host}，${info.name}以后再也不会死啦！`
  }
  const m = text.match(CHEAT)
  if (!m) return null
  const key = STATS[m[1] as keyof typeof STATS]
  const n = Number(m[2])
  if (key === 'yb' || key === 'growth') addInfo(key, n)
  else setInfo(key, Math.min(info[key] + n, save.petComputedlInfo[`${key}Max`]))
  return `${info.host}，${m[1]}+${n}，${info.name}收到啦！`
}

/** Without AI the pet still answers, just without understanding a word. */
const SILLY = [
  (n: string) => `嗯，${n}看不懂呢~`,
  (n: string, h: string) => `${h}说的话好深奥，${n}要想一想……`,
  () => '诶？再说一遍嘛~',
  (n: string) => `${n}歪了歪头，不太明白呢~`,
  (_: string, h: string) => `嘿嘿，${h}说什么都对！`,
  (n: string) => `这个……${n}还小，听不懂啦~`,
  () => '唔……能换个简单点的说法吗？',
  (n: string) => `${n}偷偷记下来了，等长大了再回答你~`,
  (n: string, h: string) => `${h}是在考${n}吗？好难呀~`,
  () => '嗯嗯！（其实没听懂）',
  (n: string) => `${n}刚刚走神了，你说什么来着？`,
  (n: string, h: string) => `听不懂，但是${n}最喜欢${h}啦~`,
]

/** The conversation, kept until the app quits; the latest turns go to the AI. */
const history: AiMessage[] = []
const TURNS = 12

/**
 * One line through the whole pipeline — the chat box and the talk key share it:
 * cheat codes, canned lines when AI is off, then the model's reply with its
 * action (LETTER included). Returns the line the pet shows.
 */
export async function talkToPet(content: string): Promise<string> {
  const said: AiMessage = { role: 'user', content }
  const canned = (save.settings.chatCheat ? cheat(content) : null) ?? (aiOn() ? null : SILLY[Math.floor(Math.random() * SILLY.length)](info.name, info.host))
  if (canned) {
    speak({ s: canned, now: true, ai: false }, 'speak')
    return canned
  }
  const reply = await ask([...history.slice(-TURNS), said], doPrompt())
  const { act, arg, say } = parse(reply ?? '')
  const line = reply ? say || '……' : '呜…我现在脑袋转不动，等会儿再聊吧~'
  // The model keeps to the action protocol only while its own earlier replies show it.
  if (reply) history.push(said, { role: 'assistant', content: act === 'LETTER' ? `LETTER:${arg.name}:「${arg.text}」 ${line}` : `${act} ${line}` })
  note('刚和主人聊过天')
  if (reply) doAct(act, line, arg)
  return line
}

let close: (() => void) | null = null

/** Chat with the pet; replies also come in its speech bubble. The window keeps keyboard focus while this is open. */
export function openChat(): void {
  if (close) return
  const log = div('chatLog f1')
  const show = (m: AiMessage): void => {
    log.append(div(`chatLine ${m.role}`, m.content))
    log.scrollTop = log.scrollHeight
  }
  history.forEach((m) => show(m.role === 'assistant' ? { ...m, content: parse(m.content).say } : m))
  const input = Object.assign(document.createElement('input'), { className: 'chatInput f1', maxLength: 200, placeholder: `和${info.name}说点什么，回车发送` })

  async function send(): Promise<void> {
    const content = input.value.trim()
    if (!content || input.disabled) return
    input.value = ''
    input.disabled = true
    show({ role: 'user', content })
    show({ role: 'assistant', content: await talkToPet(content) })
    input.disabled = false
    input.focus()
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) void send()
  })

  close = openBox(
    div(
      'ui-chat',
      div(
        'chatMain fC',
        div('chatTitle', `和${info.name}聊天`),
        log,
        div(
          'chatBar fc',
          input,
          button('chatSend fcc', () => void send(), '发送'),
        ),
      ),
    ),
    {
      onClose: () => {
        window.qqpet.setFocusable(false)
        close = null
      },
    },
  )
  window.qqpet.setFocusable(true)
  const into = (): void => input.focus()
  window.addEventListener('focus', into, { once: true })
  setTimeout(into, 50)
}
