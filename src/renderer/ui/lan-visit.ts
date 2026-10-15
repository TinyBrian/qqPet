import type { LanPeer } from '../../shared/lan'
import type { VisitMsg } from '../../shared/visit'
import { speak } from '../pet/pet'
import { info, save, stage } from '../pet/store'
import { openFrame } from './box'
import { button, div } from './dom'
import { visitDelivery } from './visit'

const peers = new Map<string, LanPeer>()
/** The friend my pet is off visiting, while it stays off the desk. */
let awayTo: string | null = null
let trip: ReturnType<typeof setTimeout> | undefined

/** Friends heard on the LAN right now. */
export const lanPeers = (): LanPeer[] => [...peers.values()]

export function initLanVisit(): void {
  // One registration per channel: the preload replaces (never stacks) listeners.
  window.qqpet.onLanOnline?.((p) => {
    peers.set(p.id, p)
    if (save.havePet) tell(`主人~ ${p.name}出来玩啦~~`)
  })
  window.qqpet.onLanOffline?.((p) => {
    peers.delete(p.id)
    if (save.havePet) tell(`主人~ ${p.name}回家啦~~`)
    // A visit into a house that just went dark: the pet walks home alone.
    if (awayTo === p.id) comeHome('主人~ 朋友家突然断线了，我先回来啦~')
  })
  window.qqpet.onLanMessage?.((fromId, body) => onMsg(fromId, body as VisitMsg))
  // Events fired before this renderer loaded are gone; seed from the main process.
  void window.qqpet.lanPeers?.().then((list) => list.forEach((p) => peers.set(p.id, p)))
}

const tell = (s: string): void => speak({ s, now: true, ai: false }, 'speak')
const hidePet = (on: boolean): void => {
  const el = document.getElementById('pet')
  if (el) el.hidden = on
}

/** The pet walks off toward its friend and comes home with a line. */
function depart(toId: string, line: string): void {
  awayTo = toId
  clearTimeout(trip)
  trip = window.setTimeout(() => comeHome('主人~ 我回来啦~'), 300_000)
  speak({ s: line, now: true, ai: false }, 'hide', {
    // A fast reply can send the pet home before this animation ends; hiding
    // afterwards would swallow the pet forever.
    end: () => {
      if (awayTo !== null) hidePet(true)
    },
  })
}

function comeHome(line: string): void {
  if (awayTo === null) return tell(line)
  awayTo = null
  clearTimeout(trip)
  hidePet(false)
  speak({ s: line, now: true, ai: false }, 'appear')
}

/** A tiny text prompt in the alert frame: type a line, send the pet off. */
function promptView(title: string, hint: string, ok: (text: string) => void): void {
  const input = Object.assign(document.createElement('input'), { className: 'chatInput f1', maxLength: 60, placeholder: '在这里写口信…' })
  Object.assign(input.style, {
    width: '100%',
    height: '52px',
    boxSizing: 'border-box',
    font: '600 15px inherit',
    padding: '4px 8px',
    borderRadius: '6px',
    border: '2px solid #a56a2a',
  })
  const view = div('windowView', div('title', title), div('main', div('msg', hint), input))
  const raw = openFrame(div('ui-window', view), 'pet/windowTip/alert/bg.png')
  // Typing needs the window to take keyboard focus; the pet window is
  // unfocusable by default so it never steals keystrokes from other apps.
  const close = (): void => {
    window.qqpet.setFocusable(false)
    raw()
  }
  window.qqpet.setFocusable(true)
  const into = (): void => input.focus()
  window.addEventListener('focus', into, { once: true })
  input.focus()
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      close()
      ok(input.value.trim())
    }
  })
  view.append(
    button('windowViewBut', close),
    button('windowViewButSubmit', () => {
      close()
      ok(input.value.trim())
    }),
  )
}

/** The knock at the door: two labeled choices and nothing of the letter inside. */
function knockView(msg: string, open: () => void, refuse: () => void): void {
  const view = div('windowView', div('title', '有人敲门'), div('main', div('msg', msg)))
  const raw = openFrame(div('ui-window', view), 'pet/windowTip/alert/bg.png')
  let decided = false
  const decide = (run: () => void): void => {
    if (decided) return
    decided = true
    clearTimeout(timer)
    raw()
    run()
  }
  // Nobody at the door for a minute counts as 不开门.
  const timer = window.setTimeout(() => decide(refuse), 60_000)
  const mk = (label: string, run: () => void, side: 'left' | 'right'): HTMLElement => {
    const b = button('visitChoice', () => decide(run), label)
    Object.assign(b.style, {
      position: 'absolute',
      bottom: '12px',
      [side]: '28px',
      width: '76px',
      height: '36px',
      zIndex: '99',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(#fff6df, #f3cf8e)',
      border: '2px solid #a56a2a',
      borderRadius: '8px',
      color: '#5a2803',
      font: '600 15px inherit',
      cursor: 'pointer',
    })
    return b
  }
  view.append(mk('开门', open, 'left'), mk('不开门', refuse, 'right'))
}

/** Menu entry: runs on click (a `children` menu row swallows clicks). */
export function sendLetter(): void {
  const list = lanPeers()
  if (!list.length) return tell('主人~ 现在没有朋友在线呢，等他们出来玩吧~')
  if (list.length === 1) return goVisit(list[0])
  pickFriend(goVisit)
}

/** One button per friend; menu submenus are hover-only, so this runs from a click. */
function pickFriend(ok: (p: LanPeer) => void): void {
  const view = div(
    'windowView',
    div('title', '去谁家送信？'),
    div(
      'main',
      ...lanPeers().map((p) => {
        const b = button('visitBut', () => {
          close()
          ok(p)
        }, `去${p.name}家`)
        Object.assign(b.style, { display: 'block', width: '100%', padding: '6px 10px', marginBottom: '6px' })
        return b
      }),
    ),
  )
  const close = openFrame(div('ui-window', view), 'pet/windowTip/alert/bg.png')
}

function goVisit(peer: LanPeer): void {
  if (stage() === 'Egg') return tell('主人~ 等我破壳了再去送信吧~')
  promptView(`去${peer.name}家送信`, '想让它带句什么话？（可留空单纯去玩）', (text) => {
    const msg: VisitMsg = { t: 'visit', name: info.name, host: info.host, sex: info.sex, stage: stage(), text }
    void window.qqpet.lanSend?.(peer.id, msg).then((r) => {
      if (r === 'queued') return tell(`主人~ ${peer.name}不在家，我先把话记下，等他回来就去说~~`)
      depart(peer.id, `主人~ 我去${peer.name}家送信啦~~`)
    })
  })
}

function onMsg(fromId: string, m: VisitMsg): void {
  const name = peers.get(fromId)?.name ?? '朋友'
  if (m.t === 'visit') {
    // A knock at the door only: the letter stays sealed until the door opens.
    knockView(`${m.name}来敲门啦`, () => {
      void window.qqpet.lanSend?.(fromId, { t: 'visitOk' })
      visitDelivery({ name: m.name, sex: m.sex, stage: m.stage }, m.text, (reply) => void window.qqpet.lanSend?.(fromId, { t: 'visitEnd', reply }))
    }, () => void window.qqpet.lanSend?.(fromId, { t: 'visitNo' }))
  } else if (m.t === 'visitOk') {
    if (awayTo === fromId) tell(`主人~ 我到${name}家啦~~`)
  } else if (m.t === 'visitNo') {
    comeHome(`主人~ ${name}家现在不方便呢，下次再去~`)
  } else if (m.t === 'visitEnd') {
    comeHome(m.reply ? `主人~ ${name}说：「${m.reply}」` : `主人~ 我从${name}家回来啦~~`)
  }
}
