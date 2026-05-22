import { vi } from 'vitest'

const keytar = {
  getPassword: vi.fn((_service: string, _account: string): Promise<string | null> =>
    Promise.resolve(null)
  ),
  setPassword: vi.fn((_service: string, _account: string, _password: string): Promise<void> =>
    Promise.resolve()
  ),
  deletePassword: vi.fn((_service: string, _account: string): Promise<boolean> =>
    Promise.resolve(true)
  ),
  findCredentials: vi.fn(
    (_service: string): Promise<Array<{ account: string; password: string }>> =>
      Promise.resolve([])
  ),
  findPassword: vi.fn((_service: string): Promise<string | null> => Promise.resolve(null)),
}

export default keytar
