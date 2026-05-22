export default class Store {
  private data: Record<string, unknown> = {}

  get(key: string): unknown {
    return this.data[key]
  }

  set(key: string, value: unknown): void {
    this.data[key] = value
  }

  delete(key: string): void {
    delete this.data[key]
  }

  has(key: string): boolean {
    return key in this.data
  }

  clear(): void {
    this.data = {}
  }

  store(): Record<string, unknown> {
    return { ...this.data }
  }
}
