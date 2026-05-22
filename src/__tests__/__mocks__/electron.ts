import { vi } from 'vitest'
import os from 'os'
import path from 'path'

export const TEST_HOME = path.join(os.tmpdir(), 'guidance-studio-test')

export const app = {
  getPath: vi.fn((key: string) => {
    if (key === 'home') return TEST_HOME
    return path.join(TEST_HOME, key)
  }),
  getVersion: vi.fn(() => '1.0.0'),
  quit: vi.fn(),
  on: vi.fn(),
  requestSingleInstanceLock: vi.fn(() => true),
  whenReady: vi.fn(() => Promise.resolve()),
}

export const BrowserWindow = Object.assign(
  vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    webContents: { send: vi.fn(), on: vi.fn() },
    on: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    setMenuBarVisibility: vi.fn(),
    setTitleBarOverlay: vi.fn(),
  })),
  {
    getAllWindows: vi.fn(() => []),
  }
)

export const ipcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  removeHandler: vi.fn(),
}

export const nativeImage = {
  createFromBuffer: vi.fn(() => ({
    isEmpty: vi.fn(() => false),
    getSize: vi.fn(() => ({ width: 1280, height: 800 })),
    resize: vi.fn().mockReturnThis(),
    toJPEG: vi.fn(() => Buffer.from('jpeg-data')),
  })),
}

export const protocol = {
  handle: vi.fn(),
}

export const shell = {
  openExternal: vi.fn(() => Promise.resolve()),
  openPath: vi.fn(() => Promise.resolve('')),
}

export const nativeTheme = {
  themeSource: 'dark' as const,
}

export const systemPreferences = {
  getMediaAccessStatus: vi.fn(() => 'granted'),
}

export const dialog = {
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
}
