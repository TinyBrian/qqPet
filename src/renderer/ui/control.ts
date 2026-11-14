import { describe, type Good, type GoodType } from '../pet/data/goods'
import { toolbarScaleFor } from '../../shared/layout'
import { listGoods, onGoodsChange, pageOf, type Page } from '../pet/goods'
import { doctor, useItem } from '../pet/items'
import { speak } from '../pet/pet'
import {
  describeStudy,
  describeWork,
  majorSchool,
  nextSchool,
  schoolOf,
  schoolDone,
  STUDY_SCHOOLS,
  study,
  examPending,
  studyDone,
  studyGoods,
  studyMenu,
  studyBlocker,
  work,
  workGoods,
} from '../pet/jobs'
import { info, onInfoChange, petSize, save } from '../pet/store'
import { viewportSize } from './viewport'
import './css/control.css'
import { button, div, img, touch } from './dom'
import { openCommunity } from './community'
import { openEmail } from './email'
import { openFarm } from './farm'
import { openFishing } from './fishing'
import { openGames } from './games'
import { openMstx } from './mstx'
import { openPetInfo } from './petinfo'
import { progress } from './progress'
import { openSetup } from './setup'
import { openShop } from './shop'
import { openSignIn } from './signin'
import { setBubbleLift } from './talk'
import { openTask } from './task'
import { openTravel } from './travel'
import { rubberBand, snapStep } from './swipe'

const ICONS = 'pet/control/icons/'
const BAR_HEIGHT = 180
/** The goods panel, the bar's widest part. */
const BAR_WIDTH = 314
const EDGE = 10
/** Where the penguin's head and feet sit in the pet box; the swf leaves the rest transparent. */
const HEAD = 0.4
const FEET = 0.95
/** A finger needs longer than a mouse to find the next button. */
const HIDE_MS = touch ? 5000 : 1500
const PAGE = 4

type Stat = 'hunger' | 'clean' | 'health' | 'mood'

/** A tip line: plain text, or a requirement the pet does not meet, which greys the icon and turns red. */
type PanelLine = string | { text: string; bad?: boolean }

/** A list of goods to pick from, 4 per page. */
interface Panel {
  icon: string
  list: (page: number) => Page
  lines: (g: Good) => PanelLine[]
  /** Returns true when the panel should close. */
  use: (g: Good) => boolean
  /** Everyday panels: the inventory type shown, with the bar of the stat it restores and a shop link. */
  type?: GoodType
  stat?: Stat
  /** A row of small buttons across the top, e.g. the study panel's school filter; built per render so the active one moves. */
  tabs?: () => { label: string; on: boolean; run: () => void }[]
  /** Items that are finished but stay in the list, marked with a certificate, e.g. a passed school course. */
  done?: (g: Good) => boolean
  /** What an empty page says instead of 空空如也~~. */
  empty?: string
}

interface Entry {
  name: string
  icon: string
  run: () => void
}

const activeIcon = (n: number): string => `${ICONS}active/${n}.svg`

const inventory = (type: GoodType, icon: number, stat: Stat) => (): void =>
  openPanel({
    icon: activeIcon(icon),
    list: (page) => listGoods(type, page, PAGE),
    lines: (g) => [...describe(g), `数量：${g.num}`],
    use: (g) => {
      useItem(g)
      return false
    },
    type,
    stat,
  })

const PANELS = {
  food: inventory('food', 18, 'hunger'),
  clean: inventory('clean', 20, 'clean'),
  medicine: inventory('medicine', 22, 'health'),
  toy: inventory('toy', 28, 'mood'),
}

/** A menu group opens its children on hover, or runs `run` on click. */
const MENU: { name: string; icon: string; children?: Entry[]; run?: () => void }[] = [
  {
    name: '日常',
    icon: 'richang.png',
    children: [
      { name: '食物', icon: 'weishi.png', run: PANELS.food },
      { name: '清洁', icon: 'qingjie.png', run: PANELS.clean },
      { name: '吃药', icon: 'zhibing.png', run: PANELS.medicine },
      { name: '玩具', icon: 'wanshua.png', run: PANELS.toy },
    ],
  },
  {
    name: '交互',
    icon: 'chongwu.png',
    children: [
      {
        name: '打工',
        icon: 'dagong.png',
        run: () => openPanel({ icon: activeIcon(26), list: (page) => pageOf(workGoods(), page, PAGE), lines: describeWork, use: work }),
      },
      {
        name: '学习',
        icon: 'xuexi.png',
        run: openStudy,
      },
      { name: '旅游', icon: 'lvyou.png', run: openTravel },
      { name: '看病', icon: 'zhibing.png', run: doctor },
    ],
  },
  {
    name: '工具',
    icon: 'renwu.png',
    children: [
      { name: '邮箱', icon: 'haoyou.png', run: openEmail },
      { name: '任务', icon: 'renwu1.png', run: openTask },
      { name: '签到', icon: 'juanzhou00.png', run: openSignIn },
      { name: '设置', icon: 'guanli.png', run: openSetup },
    ],
  },
  {
    name: '活动',
    icon: 'gonggao.png',
    children: [
      { name: '池塘', icon: 'fish01.png', run: openFishing },
      { name: '农场', icon: 'nongchang01.png', run: openFarm },
      { name: '游戏', icon: 'game.svg', run: openGames },
      { name: '密室', icon: 'mstx.png', run: openMstx },
      { name: '社区', icon: 'shequ.png', run: openCommunity },
    ],
  },
  { name: '档案', icon: 'dangan.png', run: openPetInfo },
]

const control = div('control')
control.dataset.hit = ''
document.body.appendChild(div('ui-control', control))

let shown = false
let hideTimer = 0
let open: (Panel & { page: number; offset: number; ids: string }) | null = null

/**
 * Visible page box the bar must stay inside. Desktop uses the overlay size; when Android zooms the
 * layout viewport above what is shown, prefer the visual viewport so the panel is not clipped (#124 #103).
 */
function screenBox(): { left: number; top: number; width: number; height: number } {
  const base = touch ? { width: innerWidth, height: innerHeight } : viewportSize()
  const vv = window.visualViewport
  if (vv && vv.scale > 1.01) {
    return {
      left: vv.offsetLeft,
      top: vv.offsetTop,
      width: Math.min(vv.width, base.width),
      height: Math.min(vv.height, base.height),
    }
  }
  return { left: 0, top: 0, width: base.width, height: base.height }
}

/**
 * Centered under the pet's feet; when there is no room below, mirrored above its head. Kept on screen.
 * Native iPads use the original toolbar size; other touch hosts grow it with the pet.
 */
function place(): void {
  const size = petSize()
  const box = screenBox()
  const scale = toolbarScaleFor(size, (box.width - 2 * EDGE) / BAR_WIDTH, touch, window.qqpet.deviceKind)
  const height = BAR_HEIGHT * scale
  const half = (BAR_WIDTH * scale) / 2 + EDGE
  const feet = info.lastY + size * FEET
  const onTop = feet > box.top + box.height - EDGE - height
  control.classList.toggle('up', onTop)
  // Prefer the pet's center, then clamp so the 314px goods panel (scaled) stays fully visible (#124).
  const center = Math.min(Math.max(info.lastX + size / 2, box.left + half), box.left + box.width - half)
  control.style.left = `${center}px`
  control.style.top = `${onTop ? info.lastY + size * HEAD : feet}px`
  control.style.transform = `scale(${scale})`
  setBubbleLift(shown && onTop ? Math.max(height - size * HEAD, 0) : 0)
  // Tooltips and submenus can still stick out: nudge after layout if children overflow the visible box.
  requestAnimationFrame(() => {
    if (!shown) return
    let minL = center
    let maxR = center
    for (const child of control.children) {
      const r = (child as HTMLElement).getBoundingClientRect()
      if (r.width <= 0 && r.height <= 0) continue
      minL = Math.min(minL, r.left)
      maxR = Math.max(maxR, r.right)
    }
    let shift = 0
    if (maxR > box.left + box.width - EDGE) shift = box.left + box.width - EDGE - maxR
    if (minL + shift < box.left + EDGE) shift = box.left + EDGE - minL
    if (shift) control.style.left = `${center + shift}px`
    control.classList.toggle('nearRight', center + shift > box.left + box.width / 2)
  })
}

/** A tap leaves its menu hovered, children shown: on touch the bar goes once a child is picked, unless it opened a goods panel. */
function pick(run: () => void): void {
  run()
  if (touch && !open) hide()
}

const menus = div(
  'menus fcc',
  ...MENU.map((g, index) => {
    const icon = div('menuItemIconBox', img('menuItemIcon', ICONS + g.icon))
    // control.css lights the icons up one after another, without a timer chain a loading SWF could stall.
    icon.style.setProperty('--menu-delay', `${index * 130}ms`)
    const item = div(
      'menuItem fcc focusPress',
      div('menuTip', g.name),
      icon,
      ...(g.children
        ? [div('childrenMenu', ...g.children.map((c) => button('childrenMenuItem fc', () => pick(c.run), img('childrenMenuItemIcon', ICONS + c.icon), ` ${c.name}`)))]
        : []),
    )
    if (g.run) item.addEventListener('click', g.run)
    item.addEventListener('mouseenter', () => {
      // A real cursor hovering the bar takes over from the opening wave and holds the bar open. A finger has no
      // hover: the synthetic mouseenter a tap emits must not cut the wave short (or cancel the hide timer).
      if (touch) return
      control.classList.add('introOff')
      clearTimeout(hideTimer)
    })
    item.addEventListener('mouseleave', scheduleHide)
    return item
  }),
)
control.appendChild(menus)
// Touching the bar is using it: keep it while the finger picks a level, and a new touch may reopen a submenu.
control.addEventListener('pointerdown', () => {
  control.classList.remove('submenuOff')
  scheduleHide()
})

/** Pressing the pet shows the bar. */
export function showControl(): void {
  if (save.isBury) return
  clearTimeout(hideTimer)
  if (shown) return
  shown = true
  control.classList.remove('introOff', 'submenuOff')
  control.classList.add('showControl')
  place()
}

/** Shows the bar with an everyday goods panel open. */
export function openGoods(type: keyof typeof PANELS): void {
  showControl()
  PANELS[type]()
}

/** The bar hides 1.5 s (5 s on touch screens) after the pointer leaves it, unless an inventory panel is open. */
export function scheduleHide(): void {
  clearTimeout(hideTimer)
  if (open) return
  hideTimer = window.setTimeout(hide, HIDE_MS)
}

function hide(): void {
  shown = false
  control.classList.remove('showControl')
  place()
}

/** Whether the bar (or one of its panels) is on screen. */
export const controlShown = (): boolean => shown

/** The parts of the bar a tap belongs to: the icon row, its tooltips and submenus, and a goods panel. */
const HIT_PARTS = '.menuItem, .menuTip, .childrenMenu, .goodList'

/** Whether a page point belongs to the bar, so a tap there is using the menu rather than leaving it. */
export function controlHitAt(x: number, y: number): boolean {
  if (!shown) return false
  for (const el of control.querySelectorAll<HTMLElement>(HIT_PARTS)) {
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom) return true
  }
  return false
}

/** The menu item whose submenu the cursor or a finger has open. */
function openSubmenu(): HTMLElement | null {
  for (const item of control.querySelectorAll<HTMLElement>('.menuItem')) {
    const menu = item.querySelector<HTMLElement>('.childrenMenu')
    if (!menu || !item.matches(':hover')) continue
    if (getComputedStyle(menu).visibility === 'visible') return item
  }
  return null
}

/**
 * One level back out of the bar, like leaving a menu: a goods panel closes to the icon row, an open submenu closes to
 * the row, and the row itself closes. False when the bar was not on screen.
 */
export function dismissControl(): boolean {
  if (!shown) return false
  if (open) {
    closePanel()
    return true
  }
  if (openSubmenu()) {
    control.classList.add('submenuOff')
    return true
  }
  hide()
  return true
}

let list: HTMLElement | null = null
/** The stat bar of the open panel, updated in place so a tick does not rebuild the goods under a finger. */
let bar: HTMLElement | null = null
/** A finger is dragging the option strip; a rebuild now would drop the gesture. */
let pageDragging = false
const pageBusy = (): boolean => pageDragging

/** The good a touch already previewed; it survives rebuilds of the same panel (a count change, a page turn). */
let picked: string | null = null

/** The option ids of the pages a panel renders, so a count change can be told from a list change. */
function panelIds(p: Panel, page: number, total: number): string {
  const first = page > 1 ? page - 1 : page
  const ids: string[] = []
  for (let n = first; n <= Math.min(page + 1, total); n++) ids.push(...p.list(n).list.map((g) => g.id))
  return ids.join('|')
}

function openPanel(p: Panel, page = 1, offset = 0): void {
  if (open?.type !== p.type || open?.icon !== p.icon) picked = null
  bar = null
  menus.style.display = 'none'
  const { totalPage } = p.list(page)
  open = { ...p, page, offset, ids: panelIds(p, page, totalPage) }
  /** Item tips live at panel level: the row clips its own overflow, so a tip inside an item would be cut off. */
  const tips = new Map<HTMLElement, Good>()
  /** The options of one page, as a flat list: the row is continuous, so neighbours slide in one option at a time. */
  const options = (n: number): HTMLElement[] =>
    p.list(n).list.map((g: Good) => {
      const lines = p.lines(g).map((line) => (typeof line === 'string' ? { text: line, bad: false } : { text: line.text, bad: line.bad === true }))
      // A job whose requirements the pet misses greys its icon; its tip paints the missed lines red.
      const locked = lines.some((line) => line.bad)
      // A lesson already finished keeps its place, with a certificate in the corner (see `done` in the panel).
      const done = p.done?.(g) ?? false
      const el = div(
        `goodItem${locked ? ' locked' : ''}${done ? ' done' : ''}`,
        div(
          'goodItemIconBox fcc',
          Object.assign(img('goodItemIcon', g.url), {
            onclick: () => {
              // A tap hovers what it touches: the first one shows the good's info, the next uses it.
              if (touch && picked !== g.id) return void (picked = g.id)
              picked = null
              if (p.use(g)) closePanel()
            },
          }),
        ),
      )
      tips.set(el, g)
      return el
    })
  // The previous page is in the row too, so the list can be dragged back into it; the next one likewise.
  const first = page > 1 ? page - 1 : page
  const row: HTMLElement[] = []
  for (let n = first; n <= Math.min(page + 1, totalPage); n++) row.push(...options(n))
  if (!row.length) row.push(div('goodsNone tc w100', p.empty ?? ' 空空如也~~ '))
  const start = (page - first) * PAGE + offset
  const track = div('goodsTrack', ...row)
  track.style.marginLeft = `${(-start / PAGE) * 100}%`
  // Only the row is clipped (and faded at the edges): the status bar under it and the tips above stay whole.
  const listBox = div('goodsRow', track)
  const goodsBox = div(
    'goods f1 fC h100',
    listBox,
    ...(p.stat ? [(bar = div('progress', progress(info[p.stat], save.petComputedlInfo[`${p.stat}Max`])))] : []),
  )
  // A finger drags the list across; the release snaps it to the nearest option, the triangles turn whole pages.
  const pager = swipeItems(listBox, track, {
    start,
    count: row.length,
    first,
    total: totalPage,
    go: (next, nextOffset) => openPanel(p, next, nextOffset),
  })
  // Hovering an option shows its tip beside it, flipped to the other side when it would leave the panel.
  const tip = div('goodTip')
  const showTip = (el: HTMLElement): void => {
    const good = tips.get(el)
    if (!good) return
    // Built on every hover from the good as it is now, so a count change needs no panel rebuild.
    const lines = p.lines(good).map((line) => (typeof line === 'string' ? { text: line, bad: false } : { text: line.text, bad: line.bad === true }))
    tip.replaceChildren(div('goodName', good.name), ...lines.map((line) => div(`goodDatas${line.bad ? ' bad' : ''}`, line.text)))
    tip.style.display = 'block'
    const panel = next.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    const width = tip.offsetWidth
    let left = box.right - panel.left + 6
    if (left + width > panel.width - 4) left = box.left - panel.left - width - 6
    tip.style.left = `${Math.max(2, left)}px`
    tip.style.top = `${Math.max(2, Math.min(box.top - panel.top, panel.height - tip.offsetHeight - 2))}px`
  }
  for (const el of row) {
    el.addEventListener('mouseenter', () => showTip(el))
    el.addEventListener('mouseleave', () => (tip.style.display = 'none'))
  }
  const next = div(
    'goodList focusPress',
    img('goodTypeIcon', p.icon),
    ...(p.tabs ? [tabBar(p.tabs())] : []),
    ...(p.stat ? [button('toShoppingMall', openShop, '去购物')] : []),
    button('goodClose', closePanel),
    div(
      'goodListMain fcc',
      button('toLeft', () => pager.page(-1)),
      goodsBox,
      button('toRight', () => pager.page(1)),
    ),
    tip,
  )
  if (list) list.replaceWith(next)
  else control.appendChild(next)
  list = next
  place()
  fitTabs()
}

/**
 * Drag paging for a horizontal list of options. The list follows the finger; on release it snaps to the nearest
 * option (a flick carries up to three more), and a tap still uses the option under it. The triangles move it by a
 * whole page through the same `go`, and the edge fades say whether there is more in that direction.
 */
function swipeItems(
  goods: HTMLElement,
  track: HTMLElement,
  view: { start: number; count: number; first: number; total: number; go: (page: number, offset: number) => void },
): { page: (dir: number) => void } {
  /** Which option sits at the left edge of the window. */
  let shown = view.start
  let from: { x: number; y: number } | null = null
  let last = { x: 0, t: 0 }
  let dx = 0
  let vx = 0
  let swiped = false
  /** One option's width on screen, in the pixels the pointer reports (the toolbar is scaled on a phone). */
  const pitch = (): number => goods.getBoundingClientRect().width / PAGE || 1
  /** The toolbar scale: element pixels are not viewport pixels. */
  const scaled = (): number => {
    const box = goods.getBoundingClientRect().width
    return box > 0 && goods.offsetWidth > 0 ? box / goods.offsetWidth : 1
  }
  const place = (index: number): void => void (track.style.marginLeft = `${(-index / PAGE) * 100}%`)
  /** The fades only show where there is something more to see. */
  const edges = (index: number): void => {
    goods.classList.toggle('moreLeft', index > 0)
    goods.classList.toggle('moreRight', index + PAGE < view.count)
  }
  track.style.transition = 'none'
  track.style.transform = ''
  place(shown)
  edges(shown)
  /** Slides to the option that should sit at the left edge, then rebuilds the panel there. */
  const settle = (index: number): void => {
    const page = view.first + Math.floor(index / PAGE)
    const offset = index % PAGE
    goods.classList.add('swiping')
    track.style.transition = 'margin-left .18s ease-out, transform .18s ease-out'
    track.style.transform = ''
    place(index)
    const done = (event: TransitionEvent): void => {
      if (event.propertyName !== 'margin-left') return
      track.removeEventListener('transitionend', done)
      pageDragging = false
      view.go(Math.min(Math.max(page, 1), view.total), offset)
    }
    track.addEventListener('transitionend', done)
  }
  const page = (dir: number): void => {
    const index = Math.min(Math.max(shown + dir * PAGE, 0), Math.max(view.count - 1, 0))
    if (index !== shown) settle(index)
  }
  goods.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    from = { x: event.clientX, y: event.clientY }
    last = { x: event.clientX, t: performance.now() }
    dx = 0
    vx = 0
    swiped = false
  })
  goods.addEventListener('pointermove', (event) => {
    if (!from) return
    const movedX = event.clientX - from.x
    const movedY = event.clientY - from.y
    if (!swiped) {
      // A slow start stays a tap; only a clear sideways move takes over, so the option's own click survives.
      if (Math.abs(movedX) <= 6 || Math.abs(movedX) <= Math.abs(movedY)) return
      swiped = true
      pageDragging = true
      // Capture only once it is a drag: capturing on the press retargets the release and click to the list, and the
      // option under the finger would never be pressed.
      goods.setPointerCapture(event.pointerId)
      goods.classList.add('swiping')
      track.style.transition = 'none'
    }
    const now = performance.now()
    const dt = Math.max(1, now - last.t)
    vx = (event.clientX - last.x) / dt
    last = { x: event.clientX, t: now }
    dx = movedX
    const atStart = shown <= 0
    const atEnd = shown + PAGE > view.count
    track.style.transform = `translateX(${rubberBand(dx, atStart, atEnd) / scaled()}px)`
  })
  const release = (event: PointerEvent): void => {
    if (!from) return
    from = null
    if (goods.hasPointerCapture(event.pointerId)) goods.releasePointerCapture(event.pointerId)
    if (!swiped) return
    const step = snapStep(dx, pitch(), vx)
    const target = Math.min(Math.max(shown + step, 0), Math.max(view.count - 1, 0))
    if (target === shown) {
      // Snap back to where it was.
      track.style.transition = 'transform .18s ease-out'
      track.style.transform = ''
      setTimeout(() => goods.classList.remove('swiping'), 220)
      // Only this gesture's own click is eaten: the next tap is a tap again.
      setTimeout(() => (swiped = false), 0)
      pageDragging = false
      return
    }
    settle(target)
  }
  goods.addEventListener('pointerup', release)
  goods.addEventListener('pointercancel', release)
  // The click that follows a drag must not also use the option it started on.
  goods.addEventListener(
    'click',
    (event) => {
      if (!swiped) return
      swiped = false
      event.stopPropagation()
      event.preventDefault()
    },
    true,
  )
  return { page }
}

/**
 * The stage buttons: a clipped strip between two yellow triangles, so a row that does not fit can be scrolled
 * instead of covering the close button. The strip follows a finger sideways too.
 */
function tabBar(tabs: Tab[]): HTMLElement {
  const strip = div('tabStrip', ...tabs.map((tab) => button(`goodTab${tab.on ? ' on' : ''}`, tab.run, ...(tab.star ? [star()] : []), tab.label)))
  const scroll = (dir: number) => (): void => {
    strip.scrollLeft += dir * Math.max(48, strip.clientWidth * 0.7)
  }
  let from: { x: number; left: number } | null = null
  let dragging = false
  strip.addEventListener('pointerdown', (event) => {
    from = { x: event.clientX, left: strip.scrollLeft }
    dragging = false
  })
  strip.addEventListener('pointermove', (event) => {
    if (!from) return
    const moved = event.clientX - from.x
    if (!dragging) {
      // Only a clear sideways move scrolls the strip: capturing on the press retargets the click and the stage button
      // under the finger would never be pressed.
      if (Math.abs(moved) <= 6) return
      dragging = true
      strip.setPointerCapture(event.pointerId)
    }
    strip.scrollLeft = from.left - moved
  })
  const end = (): void => {
    from = null
    // Only this gesture's own click is eaten: the next tap is a tap again.
    setTimeout(() => (dragging = false), 0)
  }
  for (const type of ['pointerup', 'pointercancel'] as const) strip.addEventListener(type, end)
  strip.addEventListener(
    'click',
    (event) => {
      if (!dragging) return
      dragging = false
      event.stopPropagation()
      event.preventDefault()
    },
    true,
  )
  return div('goodTabs fc', button('tabArrow left', scroll(-1)), strip, button('tabArrow right', scroll(1)))
}

/** One stage button: a label, lit while it is the open stage, starred once the whole school is done. */
interface Tab {
  label: string
  on: boolean
  star?: boolean
  run: () => void
}

/**
 * The star the finished stages wear: five points cut into ten facets from the middle, light yellow alternating
 * with gold, drawn as one tiny SVG so it stays crisp at 11px. Colours sampled from the reference artwork.
 */
const STAR_SVG =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
  '<polygon points="12,12 12.00,0.00 16.05,6.43" fill="#FEE662"/>' +
  '<polygon points="12,12 16.05,6.43 23.41,8.29" fill="#FDBE01"/>' +
  '<polygon points="12,12 23.41,8.29 18.55,14.13" fill="#FED439"/>' +
  '<polygon points="12,12 18.55,14.13 19.05,21.71" fill="#FEBE00"/>' +
  '<polygon points="12,12 19.05,21.71 12.00,18.88" fill="#FEE461"/>' +
  '<polygon points="12,12 12.00,18.88 4.95,21.71" fill="#FFBD01"/>' +
  '<polygon points="12,12 4.95,21.71 5.45,14.13" fill="#FEE661"/>' +
  '<polygon points="12,12 5.45,14.13 0.59,8.29" fill="#FBD73C"/>' +
  '<polygon points="12,12 0.59,8.29 7.95,6.43" fill="#FEE661"/>' +
  '<polygon points="12,12 7.95,6.43 12.00,0.00" fill="#FEBE00"/>' +
  '</svg>'

/** The star element to put in front of a stage label. */
function star(): HTMLElement {
  const el = div('goodTabStar')
  el.innerHTML = STAR_SVG
  return el
}

/** Shows the triangles only when the stage row overflows, and keeps the chosen stage in view. */
function fitTabs(): void {
  const strip = list?.querySelector<HTMLElement>('.tabStrip')
  if (!strip) return
  const bar = strip.parentElement
  const over = strip.scrollWidth > strip.clientWidth + 1
  bar?.classList.toggle('overflow', over)
  const active = strip.querySelector<HTMLElement>('.goodTab.on')
  if (active && over) strip.scrollLeft = Math.max(0, active.offsetLeft - 8)
}

/** Which school's lessons the study panel shows; '' until it opens, then it sticks to the last choice. */
let studyTab = ''
/** Picks a school tab, back on the first page. */
const pickSchool = (panel: Panel, key: string): void => {
  studyTab = key
  openPanel(panel, 1)
}

/**
 * The study panel: a stage tab row on top. Each tab lists the lessons of that school the pet has reached, so a
 * finished course still shows with a certificate instead of vanishing; a school still ahead asks for the last one.
 */
function openStudy(): void {
  studyTab ||= majorSchool(studyGoods().map(schoolOf))
  const panel: Panel = {
    icon: activeIcon(24),
    list: (page) => pageOf(studyMenu(studyTab), page, PAGE),
    // 正在打工/上课/旅游时，和打工面板一样把选项变灰，并把原因写在提示里。
    lines: (g) => [
      ...(studyBlocker() ? [{ text: studyBlocker(), bad: true }] : []),
      ...describeStudy(g),
      ...(studyDone(g) ? ['已完成'] : examPending(g) ? ['课程已学完，点击参加考试'] : []),
    ],
    empty: '快去完成之前学业吧~',
    done: studyDone,
    use: (g) => {
      if (!studyDone(g)) return study(g)
      const next = nextSchool(studyTab)
      const label = STUDY_SCHOOLS.find(([key]) => key === next)?.[1]
      speak({ s: label ? `[host]，${g.name}我已经学完啦，接下来去学${label}的吧~~` : `[host]，${g.name}我已经学到头啦~~`, now: true, ai: false }, 'speak')
      // 引导到下个阶段：直接切到下一个学校的标签。
      if (label) pickSchool(panel, next)
      return false
    },
    tabs: () => STUDY_SCHOOLS.map(([key, label]) => ({ label, on: key === studyTab, star: schoolDone(key), run: () => pickSchool(panel, key) })),
  }
  openPanel(panel, 1)
}

function closePanel(): void {
  open = null
  list?.remove()
  list = null
  bar = null
  picked = null
  menus.style.display = ''
  scheduleHide()
}

onInfoChange((key) => {
  if (key === 'lastX' || key === 'lastY' || key === 'growth') place()
  // 只换进度条：整块重建会丢掉手指刚点过的预览，第二下又变成预览，物品用不出去
  if (open?.stat && key === open.stat && bar) {
    const next = div('progress', progress(info[open.stat], save.petComputedlInfo[`${open.stat}Max`]))
    bar.replaceWith(next)
    bar = next
  }
})
onGoodsChange((type) => {
  if (open?.type !== type || pageBusy()) return
  const total = Math.max(open.list(1).totalPage, 1)
  // 只是数量变了（吃掉一个、用一个）：提示在悬停时按现在的好物现算，所以不用重建面板，菜单也不会跳。
  if (panelIds(open, Math.min(open.page, total), total) === open.ids) return
  // 列表真的变了（某个物品用完消失、或有新物品）：重建，并保留原来的页码和格位。
  const page = Math.min(open.page, total)
  openPanel(open, page, page === open.page ? open.offset : 0)
})
