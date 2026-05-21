import { app, BrowserWindow, shell, nativeTheme, protocol, net, session, desktopCapturer, systemPreferences } from 'electron'
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

// Denying a request that asked for video makes Electron throw
// "Video was requested, but no video stream was provided". That throw is
// expected — the renderer's getDisplayMedia() rejects and shows our error
// UI — so swallow it here to avoid an unhandled main-process rejection.
function denyDisplayMedia(callback: (streams: Electron.Streams) => void): void {
  try {
    callback({})
  } catch {
    /* renderer handles the rejection */
  }
}

// Electron disables getDisplayMedia() unless the main process supplies a
// source. Without this handler the renderer's ScreenRecorder rejects with
// "Not supported". We capture the primary screen via desktopCapturer.
function registerDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then(sources => {
        if (sources.length > 0) {
          callback({ video: sources[0] })
        } else {
          // No capturable source (e.g. screen-recording permission denied).
          denyDisplayMedia(callback)
        }
      })
      .catch(() => denyDisplayMedia(callback))
  })
}

// On macOS the app must attempt screen capture at least once before it shows
// up under System Settings → Privacy & Security → Screen Recording. Until
// then the user has nothing to toggle. Prime that registration on startup.
function primeScreenCapturePermission(): void {
  if (process.platform !== 'darwin') return
  if (systemPreferences.getMediaAccessStatus('screen') === 'granted') return
  desktopCapturer.getSources({ types: ['screen'] }).catch(() => {
    /* expected to fail until permission is granted */
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
  registerDisplayMediaHandler()
  primeScreenCapturePermission()
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
