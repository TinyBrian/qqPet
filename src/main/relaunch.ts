import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { app } from 'electron'

/**
 * Starts this program again, detached, once this process is gone. An AppImage restarts through its own file: its
 * mount goes away with this process, and app.relaunch() (which runs the binary inside the mount) dies with it.
 * Electron keeps app.asar, icudtl.dat... open across the spawn, which would pin the old mount; bash drops them, then
 * waits for this process to let go of the single-instance lock.
 */
const closeFds = 'for f in /proc/$$/fd/*; do n=${f##*/}; [ "$n" -gt 2 ] && eval "exec $n<&-"; done 2>/dev/null; '
const waitFor = (pid: number): string => `while kill -0 ${pid} 2>/dev/null; do sleep 0.2; done; `

export function spawnSelf(extraArgs: string[] = []): void {
  const args = [process.env.APPIMAGE || process.execPath, ...process.argv.slice(1), ...extraArgs]
  const script = closeFds + waitFor(process.pid) + 'exec "$0" "$@"'
  const [file, argv] = existsSync('/bin/bash') ? ['/bin/bash', ['-c', script, ...args]] : [args[0], args.slice(1)]
  spawn(file, argv, { detached: true, stdio: 'inherit' }).unref()
}

/** Restarts the app: after installing content, importing a save... (#28: a lite AppImage's first run never came back). */
export function relaunch(): void {
  if (process.platform === 'linux' && process.env.APPIMAGE) spawnSelf()
  else app.relaunch()
  app.exit(0)
}
