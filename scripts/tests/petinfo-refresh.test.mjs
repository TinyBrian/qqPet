import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../../src/renderer/ui/petinfo.ts', import.meta.url), 'utf8')

function profile() {
  const timers = new Map()
  const writes = []
  const focusable = []
  let nextTimer = 0
  let closePanel
  // Model focus loss when an ancestor is replaced, so rebuilding inputs cannot pass this test.
  class Element {
    className = ''; children = []; parentElement = null; style = {}; listeners = new Map(); attributes = new Map()
    constructor(tagName) { this.tagName = tagName }
    append(...children) {
      for (const child of children) {
        this.children.push(child)
        if (child instanceof Element) child.parentElement = this
      }
    }
    contains(node) { return this === node || this.children.some(child => child instanceof Element && child.contains(node)) }
    replaceChildren(...children) {
      if (this.children.some(child => child instanceof Element && child.contains(document.activeElement))) document.activeElement = null
      for (const child of this.children) if (child instanceof Element) child.parentElement = null
      this.children = []
      this.append(...children)
    }
    set textContent(text) { this.replaceChildren(String(text)) }
    get textContent() { return this.children.map(child => child instanceof Element ? child.textContent : child).join('') }
    get lastElementChild() { return this.children.findLast(child => child instanceof Element) ?? null }
    set src(value) { this.attributes.set('src', value) }
    get src() { return this.attributes.get('src') }
    getAttribute(name) { return this.attributes.get(name) ?? null }
    addEventListener(type, listener) { this.listeners.set(type, listener) }
    focus() { document.activeElement = this }
    remove() {
      if (this.contains(document.activeElement)) document.activeElement = null
      const parent = this.parentElement
      if (parent) parent.children = parent.children.filter(child => child !== this)
      this.parentElement = null
    }
  }
  const document = { body: new Element('body'), activeElement: null, createElement: tag => new Element(tag) }
  const div = (className, ...children) => {
    const element = new Element('div')
    element.className = className
    element.append(...children)
    return element
  }
  const info = {
    name: '企鹅', host: '主人', sex: 'GG', birthDay: 1,
    onlineDataTime: 71, onLineTime: 71, growth: 80, hunger: 800, clean: 800, health: 5, mood: 800,
    yb: 10, intel: 1, strong: 2, charm: 3, luck: 4, fatigue: 0,
    pinkDiamond: false, PDiamondLevel: 0, PDgrowth: 0, PDgrowthValue: 20, PDgrowthValue_next: 100,
    PDiamondExpirationDate: 0, PDiamondYear: false, sweetHeart: false, sweetHeartOverTime: 0,
  }
  const save = {
    gameSaveDatas: { travel_china_num: 0, ddw: 0, yyds: 0 }, studyInfo: {},
    selfGoodUseOption: { background: { id: 'scene' } },
    petComputedlInfo: { level: 1, upGrowth: 0, nextGrowth: 100, hungerMax: 1000, cleanMax: 1000 },
  }
  const context = vm.createContext({
    document, info, save, div,
    img: (className, src) => Object.assign(new Element('img'), { className, src }),
    button: (className, click) => { const element = div(className); element.addEventListener('click', click); return element },
    typeable: input => input,
    progress: (_n, _m, options) => div('progress', options.text ?? ''),
    formatDate: seconds => `date-${seconds}`,
    age: minutes => `${minutes}分钟`, status: () => ['健康'], growthPerMinute: () => 1,
    avatar: () => `pet/avatar/GG${save.petComputedlInfo.level >= 10 ? 'Adult' : 'Kid'}.png`,
    luck: () => info.luck, fatigue: () => info.fatigue,
    diploma: () => null,
    goodOf: (_type, id) => ({ url: `pet/background/${id}.png` }),
    setInfo: (key, value) => { writes.push([key, value]); info[key] = value },
    window: { qqpet: { setFocusable: value => { focusable.push(value); if (!value) document.activeElement = null } } },
    setInterval: (callback, delay) => { assert.equal(delay, 1000); timers.set(++nextTimer, callback); return nextTimer },
    clearInterval: id => timers.delete(id),
    openBox(content, options) {
      document.body.append(content)
      closePanel = () => { content.remove(); options.onClose() }
      return closePanel
    },
  })
  const script = source.replace(/^import[^\n]*\n/gm, '').replace('export function openPetInfo', 'function openPetInfo')
  vm.runInContext(stripTypeScriptTypes(script) + '\nthis.openPetInfo = openPetInfo', context)
  const find = (className, root = document.body) => {
    if (root.className.split(' ').includes(className)) return root
    for (const child of root.children) if (child instanceof Element) {
      const match = find(className, child)
      if (match) return match
    }
    return null
  }
  return {
    context, info, save, document, timers, writes, focusable, find,
    close: () => closePanel(),
    refresh: () => { for (const callback of timers.values()) callback() },
  }
}

test('an open profile refreshes growing readouts and memberships without replacing draft inputs or focus', () => {
  const app = profile()
  app.context.openPetInfo()
  const input = app.find('petName').children[1]
  const main = app.find('petInfoMain')
  const levelValue = app.find('level').lastElementChild
  const moneyValue = app.find('yb').lastElementChild
  input.value = '还没有保存的昵称'
  input.selectionStart = 2
  input.selectionEnd = 5
  input.focus()
  assert.ok(!app.find('pinkDiamondMain') || app.find('pinkDiamondMain').style.display === 'none')
  assert.equal(app.find('level').textContent, '等级：1')

  Object.assign(app.info, {
    onlineDataTime: 72, growth: 1200, yb: 80, intel: 11, strong: 12, charm: 13, luck: 7, fatigue: 3,
    pinkDiamond: true, PDiamondLevel: 2, PDgrowth: 120, PDgrowthValue_next: 300,
    PDiamondExpirationDate: 999, sweetHeart: true, sweetHeartOverTime: 888,
  })
  app.save.petComputedlInfo.level = 10
  app.save.selfGoodUseOption.background = null
  app.refresh()

  for (const [className, text] of Object.entries({ level: '等级：10', yb: '元宝：80', intel: '智力：11', strong: '武力：12', charm: '魅力：13' }))
    assert.equal(app.find(className).textContent, text)
  assert.match(app.find('stats').textContent, /在线时间：72分钟/)
  assert.match(app.find('luckyFatigue').textContent, /幸运值：7.*疲倦值：3/)
  assert.equal(app.find('penguin_breathe').src, 'pet/avatar/GGAdult.png')
  assert.equal(app.find('headImg').style.backgroundImage, 'url(pet/info/16.svg)')
  assert.equal(app.find('pinkDiamondMain').style.display, '')
  assert.equal(app.find('pinkDiamond').style.backgroundImage, 'url(pet/info/u2.svg)')
  assert.equal(app.find('pinkDiamondUP').textContent, '120 / 300')
  assert.match(app.find('pinkDiamondMain').title, /date-999/)
  assert.equal(app.find('sweetHeart').style.backgroundImage, 'url(pet/stateInfo/h_up.png)')

  Object.assign(app.info, { pinkDiamond: false, sweetHeart: false, sweetHeartOverTime: 0 })
  app.refresh()
  assert.equal(app.find('pinkDiamond').style.backgroundImage, 'url(pet/info/n2.svg)')
  assert.equal(app.find('pinkDiamondMain').title, '当前未开通粉钻')
  assert.equal(app.find('sweetHeart').style.backgroundImage, 'url(pet/stateInfo/h_down.png)')
  assert.equal(app.find('sweetHeart').title, '当前未开启贴心宝贝')
  assert.equal(app.find('petInfoMain'), main)
  assert.equal(app.find('level').lastElementChild, levelValue)
  assert.equal(app.find('petName').children[1], input)
  assert.equal(input.value, '还没有保存的昵称')
  assert.equal(input.selectionStart, 2)
  assert.equal(input.selectionEnd, 5)
  assert.equal(app.document.activeElement, input)
  assert.deepEqual(app.writes, [], 'refresh must not commit the draft')
  assert.deepEqual(app.focusable, [true], 'refresh must not change window focus')

  app.close()
  assert.equal(app.timers.size, 0)
  app.info.yb = 90
  app.refresh()
  assert.equal(moneyValue.textContent, '80', 'a closed panel must stop refreshing')
  assert.equal(app.find('petInfoMain'), null)
  assert.deepEqual(app.focusable, [true, false])
})

test('reopening the profile disposes the previous refresh timer', () => {
  const app = profile()
  app.context.openPetInfo()
  const first = app.find('petInfoMain')
  app.context.openPetInfo()
  assert.equal(app.timers.size, 1)
  assert.notEqual(app.find('petInfoMain'), first)
  assert.equal(app.document.body.children.length, 1)
  app.close()
  assert.equal(app.timers.size, 0)
})
