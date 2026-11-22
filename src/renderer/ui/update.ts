import { APP_VERSION } from '../../shared/version'
import type { Release } from '../../shared/ipc'
import { speak } from '../pet/pet'
import { save, update } from '../pet/store'
import { windowView } from './window-view'

const DAY = 86400

/** x.y.z compared numerically; pre-release and build metadata are ignored. */
function newer(a: string, b: string): boolean {
  const pa = a.split(/[+-]/)[0].split('.').map(Number)
  const pb = b.split(/[+-]/)[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

/** Offers the download page of a newer release. Only a manual check reports "up to date" and failures. */
export async function checkUpdate(manual: boolean): Promise<void> {
  let r: Release
  try {
    r = await window.qqpet.latestRelease()
  } catch {
    if (manual) windowView({ title: '检查更新', msg: '检查更新失败，请检查网络后重试~' })
    return
  }
  update('settings', { updateCheckedAt: Math.floor(Date.now() / 1000) })
  if (!newer(r.version, APP_VERSION)) {
    if (manual) windowView({ title: '检查更新', msg: `已经是最新版本 v${APP_VERSION}~` })
    return
  }
  const shell = (): void => windowView({
    title: '发现新版本',
    msg: `新版本 v${r.version}（当前 v${APP_VERSION}），点击确认前往 GitHub 下载~`,
    ok: (close) => {
      close()
      window.qqpet.openUrl(r.url)
    },
  })
  // Desktop: a release whose content comes as a small pack on top of ours can skip the full download (#28).
  const offer = await window.qqpet.packs?.find().catch(() => null)
  if (!offer || offer.version !== r.version) return shell()
  windowView({
    title: '发现内容更新',
    msg: `v${r.version} 带来了新的宠物素材，可以只下载 ${(offer.size / 1048576).toFixed(1)} MB 的内容包（v${offer.base} → v${offer.version}），不用重装程序。确认下载内容包，取消则查看完整新版本~`,
    ok: (close) => {
      close()
      void installOffer()
    },
    cancel: shell,
  })
}

/** Downloads the offered pack only after the user agreed; a reload makes the new content show. */
async function installOffer(): Promise<void> {
  const packs = window.qqpet.packs!
  windowView({ title: '内容更新', msg: '正在下载内容包，请稍候~' })
  try {
    const v = await packs.download()
    packReady(v)
  } catch (e) {
    windowView({ title: '内容更新', msg: `内容包安装失败：${ipcError(e)}` })
  }
}

/** Electron prefixes a rejected invoke with the channel name. */
export const ipcError = (e: unknown): string => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function packReady(version: string): void {
  windowView({
    title: '内容更新',
    msg: `内容已更新到 v${version}，重启后生效，现在重启吗？`,
    ok: () => window.qqpet.packs!.relaunch(),
  })
}

/** Hourly look at the clock, so a machine that slept or was offline still checks once a day. */
export function startAutoUpdate(): void {
  const due = (): void => {
    if (save.settings.autoUpdate && Date.now() / 1000 - save.settings.updateCheckedAt >= DAY) void checkUpdate(false)
  }
  due()
  setInterval(due, 3600_000)
}

/**
 * At startup, once, ask the repository for the newest release and let the pet say so in its bubble; the bubble's
 * button opens the download page. The same version is announced only once, so launching the app again does not nag,
 * and a failed check (offline, no release yet) stays silent.
 */
export async function notifyNewRelease(): Promise<void> {
  let r: Release
  try {
    r = await window.qqpet.latestRelease()
  } catch {
    return
  }
  if (!r.version || !newer(r.version, APP_VERSION) || save.settings.updateNotified === r.version) return
  update('settings', { updateNotified: r.version })
  speak(
    {
      s: `[host]，我发现新版本啦！现在是 v${r.version}（我这还是 v${APP_VERSION}），要不要去 GitHub 下载新的？`,
      b: '去下载',
      now: true,
    },
    'speak',
    { ok: () => window.qqpet.openUrl(r.url) },
  )
}

/** Announces a newer release a few seconds after startup, so it does not fight the intro animation. */
export function startReleaseNotice(): void {
  setTimeout(() => void notifyNewRelease(), 8000)
}
