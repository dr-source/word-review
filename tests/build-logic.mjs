// 用项目自带的 vite 把逻辑测试打包成单文件 ES module，交给 node 直接跑
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { build } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: path.join(here, '.out'),
    emptyOutDir: true,
    minify: false,
    target: 'esnext',
    lib: {
      entry: path.join(here, 'logic.test.mjs'),
      formats: ['es'],
      fileName: () => 'logic.mjs'
    },
    rollupOptions: { external: [] }
  }
})
console.log('logic bundle built')
