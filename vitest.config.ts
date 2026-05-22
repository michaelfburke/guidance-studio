import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      electron: resolve(__dirname, 'src/__tests__/__mocks__/electron.ts'),
      keytar: resolve(__dirname, 'src/__tests__/__mocks__/keytar.ts'),
      'electron-store': resolve(__dirname, 'src/__tests__/__mocks__/electron-store.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/__tests__/unit/**/*.test.ts',
      'src/__tests__/integration/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/main/**'],
      exclude: ['src/main/main.ts'],
    },
  },
})
