import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, dialog, type BrowserWindow } from 'electron'
import type { Fetch, PackOffer, PackProgress } from '../shared/ipc'
import { APP_VERSION } from '../shared/version'
import { NO_CONTENT, bundledContent, compareVersion, contentVersion, downloadTo, fetchIndex, installPack, installedLayers, lookup, mirrored, packBlocker, pickFullPack, type Layer, type PackIndex, type PackIndexEntry } from './content-pack'
import { petsocPath } from './nocase'

// resources/{pet,icons} live next to the app in production (extraResources).
export const resourcesRoot = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
const shell = APP_VERSION.replace(/^v/, '')
/** The bundled content is the shell's own release; a lite installer bundles none and starts from a full pack. */
const bundled = bundledContent(resourcesRoot, shell)
export const hasBundledContent = bundled !== null

// Not at import: index.ts may still move userData (QQPET_USER_DATA) after this module loads.
let packsDirPath: string | undefined
const packsDir = (): string => (packsDirPath ??= join(app.getPath('userData'), 'packs'))
// Read once: installing a pack relaunches the app, so the layers never change under a running page.
let layerCache: Layer[] | undefined
const layers = (): Layer[] => (layerCache ??= installedLayers(packsDir(), bundled ?? NO_CONTENT, shell))
export const installedContent = (): string => contentVersion(layers(), bundled ?? NO_CONTENT)
/** A lite installer before its first content pack: nothing to show the pet with. */
export const contentMissing = (): boolean => installedContent() === NO_CONTENT

/** The file for a resources-relative path (pet/...), from the newest installed pack that has it, else the bundle. */
export function resourceFile(path: string): string | null {
  return lookup(layers(), resourcesRoot, path, petsocPath)
}

function install(file: string): string {
  const m = installPack(file, packsDir(), installedContent(), shell)
  return m.version
}

/** Picks a .qqpetpack and installs it; resolves with the new content version, or null when cancelled. */
export async function importPack(win: BrowserWindow | null): Promise<string | null> {
  const options = { properties: ['openFile'], filters: [{ name: 'QQ宠物内容包', extensions: ['qqpetpack'] }] } satisfies Electron.OpenDialogOptions
  const r = await (win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options))
  if (r.canceled || !r.filePaths[0]) return null
  return install(r.filePaths[0])
}

/** Back to the content shipped with the program. */
export function resetPacks(): void {
  rmSync(packsDir(), { recursive: true, force: true })
}

export const INDEX = 'https://github.com/AnkioTomas/qqpet/releases/latest/download/packs.json'

let offered: PackIndexEntry | null = null

/** The incremental pack of the latest release that applies right on the installed content, if any. */
export async function findPack(fetch: Fetch, url = INDEX): Promise<PackOffer | null> {
  const index: PackIndex = await fetchIndex(fetch, url)
  const content = installedContent()
  const fit = (index.packs ?? [])
    .filter((p) => p.base !== undefined && !packBlocker(p, content, shell))
    .sort((a, b) => compareVersion(b.version, a.version))[0]
  offered = fit ?? null
  return fit ? { version: fit.version, base: fit.base!, size: fit.size } : null
}

/** The newest full pack of the latest release for a lite installer's first run (#28); rejects with why there is none. */
export async function findFullPack(fetch: Fetch, mirror = ''): Promise<PackOffer> {
  const fit = pickFullPack(await fetchIndex(fetch, mirrored(INDEX, mirror)), installedContent(), shell)
  if (typeof fit === 'string') throw new Error(fit)
  offered = fit
  return { version: fit.version, size: fit.size }
}

/**
 * Downloads the pack findPack or findFullPack offered (never a URL from the page), streaming it to a temporary file
 * checked against the sha256 in packs.json, then installs it like an import.
 */
export async function downloadPack(fetch: Fetch, mirror = '', onProgress?: (p: PackProgress) => void): Promise<string> {
  const offer: PackIndexEntry | null = offered
  if (!offer) throw new Error('没有可用的内容更新')
  const file = join(tmpdir(), `qqpet-${process.pid}-${offer.version}.qqpetpack`)
  try {
    await downloadTo(fetch, offer, file, { mirror, onProgress })
    return install(file)
  } finally {
    rmSync(file, { force: true })
  }
}
