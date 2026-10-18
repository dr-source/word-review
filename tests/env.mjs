// Node 里模拟浏览器环境，供 store / utils 直接运行
const mem = new Map()

globalThis.localStorage = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => { mem.set(String(k), String(v)) },
  removeItem: (k) => { mem.delete(String(k)) },
  clear: () => { mem.clear() },
  key: (i) => Array.from(mem.keys())[i] ?? null,
  get length() { return mem.size }
}

globalThis.__reloadCount = 0
globalThis.window = {
  location: { reload: () => { globalThis.__reloadCount++ }, href: 'http://localhost/' },
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
}
globalThis.document = { addEventListener() {}, removeEventListener() {} }
