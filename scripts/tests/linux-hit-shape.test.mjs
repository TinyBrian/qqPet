import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { toShape } from '../../src/shared/hit-shape.ts'

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

test('page rectangles scale by zoom, snap outward and clip to the window (#45)', () => {
  assert.deepEqual(toShape([{ x: 10.5, y: 20.2, width: 100, height: 50.1 }], 2, 1000, 1000), [{ x: 21, y: 40, width: 200, height: 101 }])
  assert.deepEqual(toShape([{ x: -5, y: 990, width: 20, height: 50 }], 1, 1000, 1000), [{ x: 0, y: 990, width: 15, height: 10 }])
})

test('no rectangle keeps the window click-through instead of dropping the shape (#45)', () => {
  const none = [{ x: 0, y: 0, width: 0, height: 0 }]
  assert.deepEqual(toShape([], 1, 800, 600), none)
  assert.deepEqual(toShape([{ x: 900, y: 0, width: 10, height: 10 }], 1, 800, 600), none)
})

test('the restart drops inherited descriptors before running the app again (#45)', { skip: process.platform !== 'linux' }, () => {
  const script = src('src/main/relaunch.ts').match(/const closeFds = '(.*)'/)[1] + 'exec "$0" "$@"'
  const run = spawnSync('/bin/bash', ['-c', script, '/bin/sh', '-c', 'ls /proc/$$/fd'], { stdio: ['ignore', 'pipe', 'inherit', 'pipe', 'pipe'] })
  assert.deepEqual(run.stdout.toString().trim().split(/\s+/).filter((n) => Number(n) > 2 && Number(n) !== 255), [])
})

test('a relaunched AppImage waits for the old process to let go of the single-instance lock (#28)', { skip: process.platform !== 'linux' }, () => {
  const relaunch = src('src/main/relaunch.ts')
  const wait = relaunch.match(/const waitFor = \(pid: number\): string => `(.*)`/)[1]
  // The old process is a background job of the same shell, which reaps it (a child of this test would stay a zombie).
  const t = Date.now()
  const run = spawnSync('/bin/bash', ['-c', 'sleep 0.6 & p=$!; ' + wait.replace('${pid}', '$p') + 'echo started'], { encoding: 'utf8', timeout: 5000 })
  assert.equal(run.stdout.trim(), 'started')
  assert.ok(Date.now() - t >= 400, 'started before the old process ended')
  // Every restart of the app goes through it: content packs, save import, rebirth.
  assert.match(relaunch, /process\.platform === 'linux' && process\.env\.APPIMAGE\) spawnSelf\(\)/)
  assert.doesNotMatch(src('src/main/index.ts') + src('src/main/first-run.ts'), /app\.relaunch\(\)/)
})

test('Linux shapes the input instead of ignoring the mouse, under XWayland (#45)', () => {
  const index = src('src/main/index.ts')
  // Electron itself records the auto-picked platform as the switch, so only its value tells Wayland apart.
  assert.match(index, /process\.platform === 'linux' && !!process\.env\.DISPLAY && app\.commandLine\.getSwitchValue\('ozone-platform'\) === 'wayland'/)
  assert.match(index, /!process\.argv\.some\(\(a\) => a\.startsWith\('--ozone-platform'\)\)/)
  // app.relaunch() dies with an AppImage's mount; a detached spawn of the AppImage file survives it.
  assert.match(index, /spawnSelf\(\['--ozone-platform=x11'\]\)/)
  const relaunch = src('src/main/relaunch.ts')
  assert.match(relaunch, /\[process\.env\.APPIMAGE \|\| process\.execPath, \.\.\.process\.argv\.slice\(1\), \.\.\.extraArgs\]/)
  assert.match(relaunch, /spawn\(file, argv, \{ detached: true/)
  // The restart must come before the single-instance lock, or the new process would quit at once.
  assert.ok(index.indexOf("'--ozone-platform=x11'") < index.indexOf('requestSingleInstanceLock'))
  assert.match(index, /process\.platform === 'linux' \|\| win\.setIgnoreMouseEvents\(on\)/)
  assert.match(src('src/main/window.ts'), /if \(process\.platform === 'linux'\) win\.setShape\(/)
  assert.match(src('src/preload/index.ts'), /process\.platform === 'linux' && \{ setHitShape/)
  assert.match(src('src/renderer/main.ts'), /querySelectorAll\('#pet, \[data-hit\], \[data-hit\] \*'\)/)
})
