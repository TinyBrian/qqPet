import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, net } from 'electron'
import { IPC } from '../shared/ipc'
import { APP_VERSION } from '../shared/version'
import { downloadPack, findFullPack, findPack, hasBundledContent, importPack, installedContent, resetPacks } from './content'
import { APP_ORIGIN } from './protocol'

const PAGES = process.env.ELECTRON_RENDERER_URL ?? APP_ORIGIN

/** Content pack calls (#28), for the settings panel and the lite installer's first-run window alike. */
export function registerPackIpc(): void {
  ipcMain.handle(IPC.packInfo, () => ({ content: installedContent(), shell: APP_VERSION, bundled: hasBundledContent }))
  ipcMain.handle(IPC.importPack, (e) => importPack(BrowserWindow.fromWebContents(e.sender)))
  ipcMain.handle(IPC.resetPacks, () => resetPacks())
  ipcMain.handle(IPC.findPack, () => findPack(net.fetch))
  ipcMain.handle(IPC.findFullPack, (_e, mirror?: string) => findFullPack(net.fetch, mirror ?? ''))
  ipcMain.handle(IPC.downloadPack, (e, mirror?: string) =>
    downloadPack(net.fetch, mirror ?? '', (p) => e.sender.isDestroyed() || e.sender.send(IPC.packProgress, p)),
  )
  ipcMain.on(IPC.relaunch, () => {
    app.relaunch()
    app.exit(0)
  })
}

/**
 * A lite installer (#28) starts without pet content: a plain window offers to download the latest full pack or
 * import one, then relaunches into the pet. Closing it quits.
 */
export function openFirstRun(): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 420,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'QQ宠物 - 准备宠物内容',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true },
  })
  win.setMenu(null)
  win.once('ready-to-show', () => win.show())
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  void win.loadURL(`${PAGES}/firstrun.html`)
  return win
}
