import { speak } from '../pet/pet'
import { info, playingDesk, busy, refreshTray, save, setDeskGame, setInfo, stage } from '../pet/store'
import { BUBBLES, VISIT_STAGE, petCode, visitBox, visitDir, visitScenes, visitSteps, type Sex, type Stage } from '../pet/visit-plan'
import { SwfPlayer } from '../swf/player'
import './css/visit.css'
import { button, div } from './dom'
import { openFrame } from './box'
import { floatMood } from './float'

const MOOD = 10
let box: HTMLDivElement | null = null
let timer = 0

function finish(): void {
  clearTimeout(timer)
  if (!box) return
  box.remove()
  box = null
  setDeskGame('')
  document.getElementById('pet')!.hidden = false
  refreshTray()
}

/** A friend's pet drops by for a short scene; clicking it ends the visit. */
export function visitFriend(): void {
  if (box || playingDesk()) return
  if (stage() === 'Egg') return speak({ s: '[host]，等我破壳了再请朋友来玩吧~', now: true }, 'speak')
  if (busy() || info.health < 5) return speak({ s: '[host]，我现在不方便招待朋友呢~', now: true }, 'speak')
  const scenes = visitScenes(info.sex, stage())
  if (!scenes.length) return speak({ s: '[host]，朋友们今天都没空呢~', now: true }, 'speak')
  const scene = scenes[Math.trunc(Math.random() * scenes.length)]
  const pet = document.getElementById('pet')!
  const r = visitBox(pet.getBoundingClientRect(), innerWidth)
  setDeskGame('visit')
  pet.hidden = true
  const scale = r.w / VISIT_STAGE.w
  const bubbles = BUBBLES.map((b) =>
    Object.assign(div('visitBubble fc'), {
      style: `left:${b.x * scale}px;top:${b.y * scale}px;width:${b.w * scale}px;height:${b.h * scale}px;font-size:${Math.max(10, 13 * scale)}px`,
    }),
  )
  const stageEl = div('visitStage')
  box = div('visitWin', stageEl, ...bubbles)
  box.dataset.hit = ''
  Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` })
  box.addEventListener('click', finish)
  document.body.append(box)
  const player = new SwfPlayer(stageEl)
  const steps = visitSteps(Math.random(), scene)
  const run = (i: number): void => {
    if (!box) return
    const s = steps[i]
    if (!s) {
      setInfo('mood', Math.min(info.mood + MOOD, save.petComputedlInfo.moodMax))
      void floatMood(MOOD)
      return finish()
    }
    bubbles.forEach((b, k) => {
      b.textContent = s.talk ? s.talk[k].replace(/\[host]/g, info.host) : ''
      b.hidden = !s.talk
    })
    void player.load(visitDir(scene) + s.clip).catch(() => finish())
    timer = window.setTimeout(() => run(i + 1), s.ms)
  }
  run(0)
}

/**
 * A friend's pet drops by over the LAN carrying a line; the host answers in the
 * reply box and the visitor leaves with it. `onReply('')` = sent off without a
 * word. Shares the scene machinery with visitFriend above.
 */
export function visitDelivery(from: { name: string; sex: Sex; stage: Stage }, text: string, onReply: (reply: string) => void): void {
  if (box || playingDesk()) return onReply('')
  let said = false
  let closeView: () => void = () => {}
  const done = (reply: string): void => {
    if (said) return
    said = true
    clearTimeout(leave)
    closeView()
    window.qqpet.setFocusable(false)
    finish()
    onReply(reply)
  }
  const pet = document.getElementById('pet')!
  const r = visitBox(pet.getBoundingClientRect(), innerWidth)
  setDeskGame('visit')
  pet.hidden = true
  const scale = r.w / VISIT_STAGE.w
  const bubbles = BUBBLES.map((b) =>
    Object.assign(div('visitBubble fc'), {
      style: `left:${b.x * scale}px;top:${b.y * scale}px;width:${b.w * scale}px;height:${b.h * scale}px;font-size:${Math.max(10, 13 * scale)}px`,
    }),
  )
  bubbles.forEach((b) => (b.hidden = true))
  const stageEl = div('visitStage')
  box = div('visitWin', stageEl, ...bubbles)
  box.dataset.hit = ''
  Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` })
  document.body.append(box)
  // The letter and the reply live in the same framed dialog as the knock: the
  // scene bubbles alone were too easy to miss.
  const input = Object.assign(document.createElement('input'), { className: 'chatInput f1', maxLength: 60, placeholder: `替${info.name}回句话，回车送出` })
  Object.assign(input.style, {
    width: '100%',
    height: '52px',
    boxSizing: 'border-box',
    font: '600 15px inherit',
    padding: '4px 8px',
    borderRadius: '6px',
    border: '2px solid #a56a2a',
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') done(input.value.trim())
  })
  const letter = div('msg', text ? `「${text}」` : `${from.name}来看你啦~`)
  Object.assign(letter.style, { fontSize: '16px', fontWeight: '700' })
  const view = div('windowView', div('title', `${from.name}的口信`), div('main', letter, input))
  const raw = openFrame(div('ui-window', view), 'pet/windowTip/alert/bg.png')
  closeView = raw
  // Typing needs keyboard focus; the pet window is unfocusable by default.
  window.qqpet.setFocusable(true)
  const into = (): void => input.focus()
  window.addEventListener('focus', into, { once: true })
  input.focus()
  // One smart button: typed text means 回话, empty means 送客 — same action.
  const send = button('visitChoice', () => done(input.value.trim()), '送客')
  Object.assign(send.style, {
    position: 'absolute',
    bottom: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '96px',
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
  input.addEventListener('input', () => (send.textContent = input.value.trim() ? '回话' : '送客'))
  view.append(send)
  // The visitor goes home rather than waiting forever at a silent screen.
  const leave = window.setTimeout(() => done(''), 300_000)
  // The scene key is friend_host: our pet hosts (suffix) and the visitor should
  // be the friend (prefix). Never leave a vanished pet: with no scene or a
  // failed clip the pet comes back while the reply box keeps working.
  const plain = (): void => {
    pet.hidden = false
  }
  try {
    const can = visitScenes(info.sex, stage())
    const want = petCode(from.sex, from.stage)
    const pair = can.filter((s) => s.startsWith(`${want}_`))
    const list = pair.length ? pair : can
    if (!list.length) return plain()
    const scene = list[Math.trunc(Math.random() * list.length)]
    const player = new SwfPlayer(stageEl)
    const steps = visitSteps(Math.random(), scene)
    const run = (i: number): void => {
      if (!box) return
      const s = steps[i]
      if (!s) {
        setInfo('mood', Math.min(info.mood + MOOD, save.petComputedlInfo.moodMax))
        void floatMood(MOOD)
        return
      }
      void player.load(visitDir(scene) + s.clip).catch(() => {
        clearTimeout(timer)
        plain()
      })
      timer = window.setTimeout(() => run(i + 1), s.ms)
    }
    run(0)
  } catch (e) {
    console.error('visit scene failed:', e)
    plain()
  }
}
