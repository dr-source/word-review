/**
 * 单词复习系统 - 本地静态服务器
 * 零依赖，仅用 Node.js 内置模块
 * 用法: node server.js
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 3456
const DIST = path.join(__dirname, 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

const server = http.createServer((req, res) => {
  // SPA fallback: 非文件请求返回 index.html
  let url = req.url.split('?')[0]
  if (url === '/') url = '/index.html'

  const filePath = path.join(DIST, url)

  // 安全检查：防止路径穿越
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: 所有未匹配的路径都返回 index.html
      fs.readFile(path.join(DIST, 'index.html'), (err2, data2) => {
        if (err2) {
          res.writeHead(500)
          res.end('Server Error')
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(data2)
      })
      return
    }
    const ext = path.extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  })
})

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`
  console.log('')
  console.log('  📖 单词复习系统')
  console.log('  ───────────────')
  console.log(`  本地地址: ${url}`)
  console.log('')
  console.log('  按 Ctrl+C 停止服务')
  console.log('')
})
