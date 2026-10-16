import type { PackApi } from '../shared/ipc'

/** What the lite installer's first-run window shows (#28). */
export type FirstRunState =
  | { kind: 'idle' }
  | { kind: 'finding' }
  | { kind: 'downloading'; version: string; received: number; total: number }
  | { kind: 'installing'; version?: string }
  | { kind: 'done'; version: string }
  | { kind: 'error'; message: string }

/** Electron prefixes a rejected invoke with the channel name. */
const reason = (e: unknown): string => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export const mb = (n: number): string => `${(n / 1048576).toFixed(1)} MB`

/**
 * Download or import a full content pack, then relaunch into the pet. `show` gets every state; a failed step leaves
 * an error state and the same call retries it. Calls while one is running are ignored.
 */
export function firstRunFlow(api: Pick<PackApi, 'findFull' | 'download' | 'importPack' | 'onProgress' | 'relaunch'>, show: (s: FirstRunState) => void, relaunchDelayMs = 1200) {
  let busy = false
  let version = ''
  api.onProgress((p) => {
    if (!busy || !version) return
    show(p.received >= p.total ? { kind: 'installing', version } : { kind: 'downloading', version, received: p.received, total: p.total })
  })
  const finish = (v: string): void => {
    show({ kind: 'done', version: v })
    setTimeout(() => api.relaunch(), relaunchDelayMs)
  }
  const run = async (step: () => Promise<string | null>): Promise<void> => {
    if (busy) return
    busy = true
    try {
      const v = await step()
      if (v) finish(v)
      else show({ kind: 'idle' })
    } catch (e) {
      show({ kind: 'error', message: reason(e) })
    } finally {
      busy = false
      version = ''
    }
  }
  show({ kind: 'idle' })
  return {
    download: (mirror = ''): Promise<void> =>
      run(async () => {
        show({ kind: 'finding' })
        const offer = await api.findFull(mirror)
        version = offer.version
        show({ kind: 'downloading', version, received: 0, total: offer.size })
        return api.download(mirror)
      }),
    importPack: (): Promise<void> =>
      run(async () => {
        show({ kind: 'installing' })
        return api.importPack()
      }),
  }
}
