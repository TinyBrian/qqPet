/**
 * Closed-farm auto actions for 贴心宝贝: harvest, water/weed/kill, clear wilted, plant.
 * Mirrors FarmlandControl.farmAll against saveJsonData.farm (no Farm.swf).
 */
import type { Sol } from '../swf/sol'

export interface CropInfo {
  name: string
  seed: string
  /** Seconds to ripen. */
  time: number
  experience: number
  yield: number
  price: number
}

export interface Land {
  farmland: string
  crop?: string
  time?: number
  harvest?: unknown
  grass?: number
  worm?: number
  yield?: number
  progress?: number
  growth?: string
  state?: number
}

export interface FarmUser {
  farmland: Land[]
  burden: { Items: string; number: number }[]
  warehouse: { fruit: string; number: number; name: string; price: number }[]
  experience: string | number
  checked?: number
  [k: string]: unknown
}

export interface FarmCareResult {
  user: FarmUser
  harvested: number
  fruits: number
  cared: number
  cleared: number
  planted: number
}

const CARE_EXP = 2
const PEST_LOSS = 2

const pests = (land: Land): number =>
  (land.grass !== undefined ? 1 : 0) + (land.worm !== undefined ? 1 : 0) + (land.farmland === 'FarmlandG' ? 1 : 0)

/** Stage 5 = ripe, same as InstallFace.grow. */
export function growStage(land: Land, crops: Record<string, CropInfo>, now: number): number {
  if (!land.crop || land.harvest !== undefined) return land.harvest !== undefined ? 6 : 0
  const total = crops[land.crop]?.time ?? 0
  if (!total) return 0
  const age = now - Number(land.time ?? now)
  return age >= total ? 5 : Math.floor((age * 5) / total)
}

function ensureYield(land: Land, crops: Record<string, CropInfo>): number {
  if (land.yield !== undefined) return land.yield
  const c = crops[land.crop!]
  const base = c?.yield ?? 1
  land.yield = Math.max(1, base - 3 + Math.floor(Math.random() * 6) - PEST_LOSS * pests(land))
  return land.yield
}

function addExp(user: FarmUser, n: number): void {
  user.experience = String(Number(user.experience || 0) + n)
}

function dig(land: Land): void {
  delete land.crop
  delete land.state
  delete land.time
  delete land.growth
  delete land.harvest
  delete land.progress
  delete land.yield
  delete land.grass
  delete land.worm
}

function carePlot(land: Land): boolean {
  let did = false
  if (land.farmland === 'FarmlandG') {
    land.farmland = 'FarmlandS'
    did = true
  }
  if (land.grass !== undefined) {
    delete land.grass
    did = true
  }
  if (land.worm !== undefined) {
    delete land.worm
    did = true
  }
  return did
}

function harvestPlot(land: Land, user: FarmUser, crops: Record<string, CropInfo>, now: number): number {
  if (!land.crop || land.harvest !== undefined || growStage(land, crops, now) !== 5) return 0
  const c = crops[land.crop]
  if (!c) return 0
  const n = ensureYield(land, crops)
  const row = user.warehouse.find((w) => w.fruit === land.crop)
  if (row) row.number = Number(row.number) + n
  else user.warehouse.push({ fruit: land.crop, number: n, name: c.name, price: c.price })
  land.progress = undefined
  land.harvest = 'xx'
  delete land.grass
  delete land.worm
  addExp(user, c.experience)
  return n
}

function consumeSeed(user: FarmUser, seed: string): boolean {
  const i = user.burden.findIndex((b) => b.Items === seed)
  if (i < 0) return false
  const n = Number(user.burden[i].number) - 1
  if (n <= 0) user.burden.splice(i, 1)
  else user.burden[i].number = n
  return true
}

function nextSeed(user: FarmUser): string | null {
  for (const b of user.burden) {
    if (String(b.Items).includes('Seed') && Number(b.number) > 0) return b.Items
  }
  return null
}

function plantPlot(land: Land, user: FarmUser, seed: string, now: number): boolean {
  if (land.crop !== undefined || land.farmland === 'Wasteland') return false
  if (!consumeSeed(user, seed)) return false
  land.crop = seed
  land.time = now
  return true
}

/** Run harvest → clear → care → plant on every plot. Mutates a copy of `user`. */
export function runFarmCare(user: FarmUser, crops: Record<string, CropInfo>, now = Math.floor(Date.now() / 1000)): FarmCareResult {
  const next: FarmUser = {
    ...user,
    farmland: (user.farmland ?? []).map((l) => ({ ...l })),
    burden: (user.burden ?? []).map((b) => ({ ...b })),
    warehouse: (user.warehouse ?? []).map((w) => ({ ...w })),
  }
  let harvested = 0
  let fruits = 0
  let cared = 0
  let cleared = 0
  let planted = 0

  for (const land of next.farmland) {
    const n = harvestPlot(land, next, crops, now)
    if (n) {
      harvested++
      fruits += n
    }
  }
  for (const land of next.farmland) {
    if (land.harvest !== undefined) {
      dig(land)
      cleared++
    }
  }
  for (const land of next.farmland) {
    if (carePlot(land)) {
      cared++
      addExp(next, CARE_EXP)
    }
  }
  let seed = nextSeed(next)
  for (const land of next.farmland) {
    if (!seed) break
    if (plantPlot(land, next, seed, now)) {
      planted++
      seed = nextSeed(next)
    }
  }
  next.checked = now
  return { user: next, harvested, fruits, cared, cleared, planted }
}

/** Parse Crop.xml `<items>` into a seed-keyed table (no DOMParser: works in node tests too). */
export function cropsFromXml(xml: string): Record<string, CropInfo> {
  const out: Record<string, CropInfo> = {}
  const re = /<items\b([^>]*)\/?\s*>/gi
  for (const m of xml.matchAll(re)) {
    const attrs = m[1]
    const get = (k: string): string => new RegExp('\\b' + k + '="([^"]*)"', 'i').exec(attrs)?.[1] ?? ''
    const seed = get('seed')
    if (!seed) continue
    out[seed] = {
      name: get('name') || seed,
      seed,
      time: Number(get('time') || 0),
      experience: Number(get('experience') || 0),
      yield: Number(get('yield') || 1),
      price: Number(get('price') || 0),
    }
  }
  return out
}

export function asFarmUser(raw: Sol | FarmUser): FarmUser {
  const u = raw as FarmUser
  return {
    ...u,
    farmland: Array.isArray(u.farmland) ? u.farmland : [],
    burden: Array.isArray(u.burden) ? u.burden : [],
    warehouse: Array.isArray(u.warehouse) ? u.warehouse : [],
    experience: u.experience ?? '1',
  }
}
