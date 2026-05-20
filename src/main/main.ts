import { app, BrowserWindow, shell, nativeTheme, protocol, net } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'
import { registerIpcHandlers } from './ipc-handlers'

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (process.platform === 'win32') {
  app.setAppUserModelId(app.getName())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

nativeTheme.themeSource = 'dark'

// Custom protocol so the renderer can display run screenshots stored on disk.
// (file:// images are blocked when the renderer is served over http in dev.)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'gsasset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true }
  }
])

function registerAssetProtocol(): void {
  const runsRoot = path.join(app.getPath('home'), 'GuidanceStudio', 'runs')
  protocol.handle('gsasset', request => {
    try {
      const filePath = path.normalize(decodeURIComponent(new URL(request.url).pathname))
      // Only serve files inside the runs directory.
      if (filePath !== runsRoot && !filePath.startsWith(runsRoot + path.sep)) {
        return new Response('Forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    show: false,
    icon: undefined
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

app.whenReady().then(() => {
  registerAssetProtocol()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

export { mainWindow }
