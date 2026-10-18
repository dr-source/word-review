// 浏览器端端到端自测：无头 Chrome/Edge + CDP 真点页面
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

if (typeof WebSocket === 'undefined') {
  console.error(`端到端自测需要 Node 22+（内置 WebSocket），当前是 ${process.version}`)
  process.exit(1)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(here, '..', 'dist')

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ]
  const hit = candidates.find(p => fs.existsSync(p))
  if (!hit) throw new Error('找不到 Chrome/Edge，请用环境变量 CHROME_BIN 指定可执行文件')
  return hit
}

const CHROME = findChrome()
const PORT = Number(process.env.E2E_PORT || 9333)
const PROFILE = path.join(os.tmpdir(), `word-review-e2e-${process.pid}`)
const SCRATCH = path.join(os.tmpdir(), `word-review-e2e-${process.pid}.png`)
const CHROME_LOG = path.join(os.tmpdir(), `word-review-e2e-${process.pid}.chrome.log`)

function tail(file, chars = 3000) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    return text.length > chars ? '…' + text.slice(-chars) : text
  } catch (e) {
    return `（读不到 ${file}：${e.message}）`
  }
}

let pass = 0
const failures = []
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
}
function section(t) { console.log(`\n== ${t} ==`) }

// ---------------------------------------------------------------- 静态服务（dist）
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html 不存在，请先 npm run build')
  process.exit(1)
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.map': 'application/json'
}
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(DIST, rel)
  if (!path.resolve(file).startsWith(path.resolve(DIST))) {
    res.writeHead(403); res.end('forbidden'); return
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
const BASE = await new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))
})
console.log(`静态服务 ${BASE} → ${DIST}`)

// ---------------------------------------------------------------- 浏览器启动
fs.rmSync(PROFILE, { recursive: true, force: true })
const args = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--window-size=1280,900',
  '--remote-allow-origins=*',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  'about:blank'
]
if (process.platform === 'linux') args.unshift('--no-sandbox', '--disable-dev-shm-usage')
const chromeOut = fs.openSync(CHROME_LOG, 'w')
const proc = spawn(CHROME, args, { stdio: ['ignore', chromeOut, chromeOut] })
let chromeExit = null
proc.on('error', err => { chromeExit = `启动失败：${err.message}` })
proc.on('exit', (code, signal) => { chromeExit = `退出码 ${code}，信号 ${signal}` })

function cleanup() {
  try { proc.kill() } catch {}
  try { fs.closeSync(chromeOut) } catch {}
  try { server.close() } catch {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }) } catch {}
}
for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, err => {
    console.error(`\n自测中断：${err?.stack || err}`)
    cleanup()
    process.exit(1)
  })
}

async function versionInfo() {
  for (let i = 0; i < 120; i++) {
    if (chromeExit) throw new Error(`${CHROME} ${chromeExit}，Chrome 自己的日志：\n${tail(CHROME_LOG)}`)
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (r.ok) return r.json()
    } catch {}
    await sleep(250)
  }
  throw new Error(`${CHROME} 调试端口 ${PORT} 30 秒内未就绪，Chrome 自己的日志：\n${tail(CHROME_LOG)}`)
}

const info = await versionInfo()
console.log(`浏览器 ${info.Browser}`)

// ---------------------------------------------------------------- CDP 客户端
function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')))
  })
}
function client(ws) {
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? p.reject(new Error(`${msg.error.message} (${msg.error.code})`)) : p.resolve(msg.result)
    } else {
      for (const fn of listeners) fn(msg)
    }
  })
  return {
    send(method, params = {}, sessionId) {
      const mid = ++id
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(mid)
          reject(new Error(`CDP 调用超时：${method}`))
        }, 20000)
        pending.set(mid, {
          resolve: v => { clearTimeout(timer); resolve(v) },
          reject: e => { clearTimeout(timer); reject(e) }
        })
        ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }))
      })
    },
    on(fn) { listeners.push(fn) }
  }
}

const browser = client(await wsConnect(info.webSocketDebuggerUrl))

// 每个标签页一个 CDP session；同一个浏览器 = 同一个 localStorage
const sessions = new Set()
async function openTab(url = 'about:blank') {
  const { targetId } = await browser.send('Target.createTarget', { url })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  sessions.add(sessionId)
  await browser.send('Runtime.enable', {}, sessionId)
  await browser.send('Page.enable', {}, sessionId)
  await browser.send('Log.enable', {}, sessionId)
  return { targetId, sessionId }
}

const consoleErrors = []
const consoleWarnings = []
browser.on(msg => {
  if (!msg.sessionId || !sessions.has(msg.sessionId)) return
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' ')
    if (msg.params.type === 'error') consoleErrors.push(text)
    if (msg.params.type === 'warning') consoleWarnings.push(text)
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    consoleErrors.push(d.exception?.description || d.text)
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    consoleErrors.push(`[log] ${msg.params.entry.text}`)
  }
})

const mainTab = await openTab()
const S = mainTab.sessionId

async function evaluateIn(sid, expression) {
  const r = await browser.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true
  }, sid)
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  }
  return r.result.value
}
const evaluate = expression => evaluateIn(S, expression)

async function waitForIn(sid, expression, label, timeout = 15000) {
  const start = Date.now()
  let lastErr = ''
  while (Date.now() - start < timeout) {
    try {
      if (await evaluateIn(sid, expression)) return true
    } catch (e) { lastErr = e.message }
    await sleep(120)
  }
  let dump = ''
  try {
    const body = await evaluateIn(sid, `(document.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 400)`)
    const app = await evaluateIn(sid, `(document.querySelector('#app')?.innerHTML || '').slice(0, 400)`)
    dump = `\n页面文本：${body || '（空）'}\n#app：${app || '（空）'}`
  } catch (e) {
    dump = `\n取 DOM 也失败：${e.message}`
  }
  const errors = consoleErrors.length
    ? `\n控制台错误：\n${consoleErrors.slice(-10).join('\n')}`
    : '\n控制台无错误'
  throw new Error(`等待超时：${label}（${timeout}ms）${lastErr ? '（' + lastErr + '）' : ''}${dump}${errors}`)
}
const waitFor = (expression, label, timeout = 15000) => waitForIn(S, expression, label, timeout)

/** 只判断是否出现，不抛错（用于“预期不该发生/可能超时”的等待） */
async function waitForSoft(expression, timeout = 6000) {
  try {
    await waitFor(expression, 'soft', timeout)
    return true
  } catch {
    return false
  }
}

async function navigateIn(sid, url) {
  await browser.send('Page.navigate', { url }, sid)
  await waitForIn(sid, `document.readyState === 'complete'`, url)
}
const navigate = url => navigateIn(S, url)

const text = sel => evaluate(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '').replace(/\\s+/g, ' ').trim()`)
const exists = sel => evaluate(`!!document.querySelector(${JSON.stringify(sel)})`)
const count = sel => evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`)
const click = sel => evaluate(`(document.querySelector(${JSON.stringify(sel)})?.click(), true)`)
const clickByText = (sel, needle) => evaluate(`
  (() => {
    const el = [...document.querySelectorAll(${JSON.stringify(sel)})]
      .find(e => e.textContent.includes(${JSON.stringify(needle)}))
    if (!el) return false
    el.click()
    return true
  })()
`)
const typeIntoIn = (sid, sel, value) => evaluateIn(sid, `
  (() => {
    const el = document.querySelector(${JSON.stringify(sel)})
    if (!el) return false
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()
`)
const typeInto = (sel, value) => typeIntoIn(S, sel, value)
async function go(path) {
  await evaluate(`location.hash = ${JSON.stringify('#' + path)}`)
}

// 页面同源下清空数据，再进应用（首启流程）
await navigate(`${BASE}/manifest.json`)
await evaluate('localStorage.clear()')
await navigate(`${BASE}/#/`)
await waitFor(`!!document.querySelector('.home-page .task-count')`, '首页渲染')
await sleep(400)

// ================================================================ 1. 首启
section('1. 首次打开：默认学生 + 今日任务')
{
  const students = await evaluate(`JSON.parse(localStorage.getItem('word_review_students') || '[]')`)
  eq('自动创建 1 个默认学生', students.length, 1)
  eq('默认学生名', students[0]?.name, '默认学生')
  const currentId = await evaluate(`localStorage.getItem('word_review_current_student')`)
  eq('当前学生指向默认学生', currentId, students[0]?.id)
  ok('首页问候语带学生名', (await text('.greeting')).includes('默认学生'))
  eq('首页今日任务 0/33', await text('.task-count'), '0/33')
  ok('首页说明三种模式同源', (await text('.task-desc')).includes('翻卡 / 选择 / 拼写同一批词'))
  const task = await evaluate(`
    (() => {
      const keys = Object.keys(localStorage).filter(k => k.endsWith('_tasks'))
      const tasks = JSON.parse(localStorage.getItem(keys[0]) || '{}')
      return Object.values(tasks)[0]
    })()
  `)
  eq('今日任务词数 33', task?.ids?.length, 33)
  ok('任务日期为今天', /^\d{4}-\d{2}-\d{2}$/.test(task?.date || '') && task.date === new Date().toLocaleDateString('sv-SE'))
}

// ================================================================ 2. 翻卡
section('2. 翻卡模式：学一词，跨页面计数同步')
let firstWord = ''
{
  await go('/study')
  await waitFor(`!!document.querySelector('.flashcard-mode .word-text')`, '翻卡单词')
  eq('翻卡进度 0/33', await text('.progress-badge'), '今日任务 0/33')
  firstWord = await text('.word-text')
  ok('翻卡显示了单词', firstWord.length > 0, firstWord)
  await click('.flashcard-wrapper')
  await waitFor(`!!document.querySelector('.rating-good')`, '评分按钮')
  ok('翻面后显示释义', (await text('.word-meaning')).length > 0)
  await click('.rating-good')
  await waitFor(`document.querySelector('.progress-badge')?.textContent.includes('1/33')`, '翻卡计数 +1')
  ok('翻卡切到下一个词', (await text('.word-text')) !== firstWord)
  const barTag = await text('.student-bar')
  ok('背诵页顶部任务计数同步为 1/33', barTag.includes('今日任务 1/33 词'), barTag)

  await go('/')
  await waitFor(`document.querySelector('.home-page .task-count')?.textContent.includes('1/33')`, '首页计数同步')
  ok('返回首页进度保持 1/33', true)
}

// ================================================================ 3. 三模式同源
section('3. 三种模式取词/取义一致')
{
  const mean = await evaluate(`
    (() => {
      const words = JSON.parse(localStorage.getItem('word_review_local_words') || '[]')
      const w = words.find(x => x.word === ${JSON.stringify(firstWord)})
      return w ? w.mean : ''
    })()
  `)
  ok('本地词库能查到该词释义', mean.length > 0)

  await go('/study')
  await waitFor(`!!document.querySelector('.flashcard-mode .word-text')`, '翻卡重新渲染')
  eq('重新进入翻卡，首词不变', await text('.word-text'), firstWord)

  // 选择题
  await clickByText('.mode-selector .el-radio-button', '选择')
  await waitFor(`!!document.querySelector('.quiz-mode .quiz-word')`, '选择题渲染')
  eq('选择题首词与翻卡一致', await text('.quiz-word'), firstWord)
  eq('选择题进度从 0 开始', await text('.quiz-progress'), '今日任务 0/33')
  const clicked = await clickByText('.quiz-option', mean)
  ok('选择题里能找到该词释义作为选项', clicked)
  await waitFor(`!!document.querySelector('.quiz-feedback')`, '选择题反馈')
  ok('选择正确释义后判对', await exists('.feedback-correct'))
  await waitFor(`document.querySelector('.quiz-progress')?.textContent.includes('1/33')`, '选择题计数 +1')
  const barTag = await text('.student-bar')
  ok('选择题答对后顶部计数为 1/33（同词去重只加一次）', barTag.includes('今日任务 1/33 词'), barTag)

  // 拼写
  await clickByText('.mode-selector .el-radio-button', '拼写')
  await waitFor(`!!document.querySelector('.spelling-mode .mean-display')`, '拼写渲染')
  eq('拼写首词释义与翻卡同词', await text('.mean-display'), mean)
  await typeInto('.input-row input', firstWord)
  await click('.input-row button')
  await waitFor(`!!document.querySelector('.result-correct')`, '拼写判对')
  ok('拼写输入正确单词判对', await exists('.result-correct'))
  const barTag2 = await text('.student-bar')
  ok('拼写答对同一词后顶部计数仍为 1/33', barTag2.includes('今日任务 1/33 词'), barTag2)

  // 拼写答错 → 下一词
  await clickByText('.spelling-result button', '下一题')
  await waitFor(`!!document.querySelector('.mean-display') && !document.querySelector('.spelling-result')`, '拼写下一题')
  const secondMean = await text('.mean-display')
  await typeInto('.input-row input', 'zzzz')
  await click('.input-row button')
  await waitFor(`!!document.querySelector('.result-wrong')`, '拼写判错')
  ok('拼写答错显示正确答案', (await text('.result-wrong')).includes('正确答案'))
  ok('拼写答错提示会再出现', await exists('.retry-hint'))
  const barTag3 = await text('.student-bar')
  ok('答错新词后顶部计数为 2/33', barTag3.includes('今日任务 2/33 词'), barTag3)
}

// ================================================================ 4. 错题本
section('4. 错题本：错误次数与最近错误')
{
  await go('/wrong')
  await waitFor(`!!document.querySelector('.wrong-page .el-table')`, '错题本表格')
  const headers = await evaluate(`[...document.querySelectorAll('.wrong-page .el-table th')].map(th => th.textContent.trim())`)
  ok('错题本有「错误次数」列', headers.includes('错误次数'), headers.join('|'))
  ok('错题本有「最近错误」列', headers.includes('最近错误'), headers.join('|'))
  const rowCount = await count('.wrong-page .el-table__body tr')
  eq('错题本有 1 行（刚才拼写答错的词）', rowCount, 1)
  const firstCell = await text('.wrong-page .el-table__body tr td')
  ok('错题本行显示单词', firstCell.length > 0, firstCell)
  const cells = await evaluate(`[...document.querySelectorAll('.wrong-page .el-table__body tr td')].map(td => td.textContent.trim())`)
  ok('错误次数显示 1', cells.includes('1'), cells.join('|'))
  ok('最近错误显示时间', cells.some(c => /\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}:\d{2}/.test(c)), cells.join('|'))
}

// ================================================================ 5. 统计页刷新
section('5. 统计页：分析报告 + 二次进入刷新')
let todayBefore = 0
{
  await go('/stats')
  await waitFor(`!!document.querySelector('.stats-page .analysis-line')`, '分析报告')
  const report = await evaluate(`[...document.querySelectorAll('.analysis-line')].map(e => e.textContent).join('\\n')`)
  ok('分析报告含学生姓名', report.includes('默认学生'), report.slice(0, 120))
  ok('分析报告含今日进度', report.includes('今天已学'), report)
  ok('分析报告含错题提醒', report.includes('错题本里有'), report)
  const todayText = await evaluate(`
    (() => {
      const card = [...document.querySelectorAll('.overview-card')].find(c => c.textContent.includes('连续学习'))
      return card ? card.textContent.replace(/\\s+/g, ' ').trim() : ''
    })()
  `)
  const m = todayText.match(/今日 (\d+) 词/)
  todayBefore = m ? Number(m[1]) : -1
  eq('统计页今日学习数 = 2', todayBefore, 2)
  ok('统计页连续学习 1 天', todayText.includes('1天'), todayText)

  // 再学一个新词（翻卡会从任务里的下一个未背词继续），回到统计页应刷新
  await go('/study')
  await waitFor(`!!document.querySelector('.flashcard-mode .word-text')`, '回翻卡')
  for (let i = 0; i < 6; i++) {
    const bar = await text('.student-bar')
    if (bar.includes('今日任务 3/33')) break
    if (!(await exists('.rating-good'))) await click('.flashcard-wrapper')
    await waitFor(`!!document.querySelector('.rating-good')`, '评分按钮')
    await click('.rating-good')
    await sleep(500)
  }
  await waitFor(`document.querySelector('.student-bar')?.textContent.includes('3/33')`, '新词计数 3/33')

  await go('/stats')
  await waitFor(`!!document.querySelector('.stats-page .analysis-line')`, '统计页重新渲染')
  await sleep(300)
  const todayText2 = await evaluate(`
    (() => {
      const card = [...document.querySelectorAll('.overview-card')].find(c => c.textContent.includes('连续学习'))
      return card ? card.textContent.replace(/\\s+/g, ' ').trim() : ''
    })()
  `)
  const m2 = todayText2.match(/今日 (\d+) 词/)
  eq('二次进入统计页今日学习数刷新为 3', m2 ? Number(m2[1]) : -1, 3)
}

// ================================================================ 6. 学生档案
section('6. 学生档案：新建、切换、数据隔离')
{
  await go('/students')
  await waitFor(`!!document.querySelector('.students-page .el-table')`, '学生表格')
  eq('学生表初始 1 行', await count('.students-page .el-table__body tr'), 1)
  ok('当前学生带「当前」标签', (await text('.students-page .el-table__body')).includes('当前'))

  await typeInto('.add-row input', '张小明')
  await clickByText('.add-row button', '新建档案')
  await waitFor(`document.querySelectorAll('.students-page .el-table__body tr').length === 2`, '新增学生行')
  ok('新建学生后表格 2 行', true)
  ok('新学生继承原词本总词数（汇总列有值）', /\d+\/\d+/.test(await text('.students-page .el-table__body')))
  eq('学生列表持久化 2 人', await evaluate(`JSON.parse(localStorage.getItem('word_review_students')).length`), 2)

  // 切到张小明：会整页 reload
  const clicked = await evaluate(`
    (() => {
      const rows = [...document.querySelectorAll('.students-page .el-table__body tr')]
      const row = rows.find(r => r.textContent.includes('张小明'))
      if (!row) return false
      const btn = [...row.querySelectorAll('button')].find(b => b.textContent.includes('切换'))
      if (!btn || btn.disabled) return false
      btn.click()
      return true
    })()
  `)
  ok('点击切换学生', clicked)
  // 切换会 window.location.reload()，重载后仍停在 #/students
  let switched = false
  for (let i = 0; i < 80; i++) {
    try {
      switched = await evaluate(`
        (() => {
          const list = JSON.parse(localStorage.getItem('word_review_students') || '[]')
          const cur = localStorage.getItem('word_review_current_student')
          const s = list.find(x => x.name === '张小明')
          return !!(s && cur === s.id && document.querySelector('.students-page .el-table'))
        })()
      `)
      if (switched) break
    } catch {}
    await sleep(200)
  }
  ok('重载后当前学生已切到张小明', switched)
  await sleep(1200)
  await go('/')
  await waitFor(`document.querySelector('.home-page .greeting')?.textContent.includes('张小明')`, '切换到张小明', 20000)
  eq('新学生今日任务从 0 开始', await text('.task-count'), '0/33')
  eq('新学生为空任务也生成 33 词', await evaluate(`
    (() => {
      const keys = Object.keys(localStorage).filter(k => k.endsWith('_tasks'))
      const t = JSON.parse(localStorage.getItem(keys[0]) || '{}')
      return Object.values(t)[0]?.ids?.length || 0
    })()
  `), 33)

  // 张小明学一词
  await go('/study')
  await waitFor(`!!document.querySelector('.flashcard-mode .word-text')`, '张小明翻卡')
  await click('.flashcard-wrapper')
  await waitFor(`!!document.querySelector('.rating-good')`, '张小明评分')
  await click('.rating-good')
  await waitFor(`document.querySelector('.student-bar')?.textContent.includes('1/33')`, '张小明计数 1/33')
  await go('/')
  await waitFor(`document.querySelector('.home-page .task-count')?.textContent.includes('1/33')`, '张小明首页 1/33')

  // 张小明再标一个「不认识」，用于验证错题本按学生隔离
  await go('/study')
  await waitFor(`!!document.querySelector('.flashcard-mode .word-text')`, '张小明翻卡 2')
  await click('.flashcard-wrapper')
  await waitFor(`!!document.querySelector('.rating-again')`, '张小明评分 2')
  await click('.rating-again')
  await sleep(500)
  await go('/wrong')
  await waitFor(`!!document.querySelector('.wrong-page .el-table')`, '张小明错题本')
  eq('张小明错题本 1 行（与默认学生互不影响）', await count('.wrong-page .el-table__body tr'), 1)
  eq('张小明错题本记录写入自己的命名空间', await evaluate(`
    (() => {
      const list = JSON.parse(localStorage.getItem('word_review_students') || '[]')
      const s = list.find(x => x.name === '张小明')
      if (!s) return -1
      return JSON.parse(localStorage.getItem('wr_' + s.id + '_wrong') || '[]').length
    })()
  `), 1)

  // 切回默认学生
  await go('/students')
  await waitFor(`!!document.querySelector('.students-page .el-table')`, '学生表重新渲染')
  const back = await evaluate(`
    (() => {
      const rows = [...document.querySelectorAll('.students-page .el-table__body tr')]
      const row = rows.find(r => r.textContent.includes('默认学生'))
      if (!row) return false
      const btn = [...row.querySelectorAll('button')].find(b => b.textContent.includes('切换'))
      if (!btn || btn.disabled) return false
      btn.click()
      return true
    })()
  `)
  ok('切回默认学生', back)
  let switchedBack = false
  for (let i = 0; i < 80; i++) {
    try {
      switchedBack = await evaluate(`
        (() => {
          const list = JSON.parse(localStorage.getItem('word_review_students') || '[]')
          const cur = localStorage.getItem('word_review_current_student')
          const s = list.find(x => x.name === '默认学生')
          return !!(s && cur === s.id && document.querySelector('.students-page .el-table'))
        })()
      `)
      if (switchedBack) break
    } catch {}
    await sleep(200)
  }
  ok('重载后当前学生已切回默认学生', switchedBack)
  await sleep(1200)
  await go('/')
  await waitFor(`document.querySelector('.home-page .greeting')?.textContent.includes('默认学生')`, '切回默认学生', 20000)
  eq('默认学生进度保留 3/33', await text('.task-count'), '3/33')
  await go('/wrong')
  await waitFor(`!!document.querySelector('.wrong-page')`, '默认学生错题本')
  const defaultWrong = await exists('.wrong-page .el-table') ? await count('.wrong-page .el-table__body tr') : 0
  eq('默认学生错题本不受张小明影响（0 行）', defaultWrong, 0)
  eq('张小明错题本数据仍保留在 localStorage', await evaluate(`
    (() => {
      const list = JSON.parse(localStorage.getItem('word_review_students') || '[]')
      const s = list.find(x => x.name === '张小明')
      if (!s) return -1
      return JSON.parse(localStorage.getItem('wr_' + s.id + '_wrong') || '[]').length
    })()
  `), 1)
}

// ================================================================ 7. 数据迁移（独立上下文，不改当前数据）
section('7. 旧版数据迁移到默认学生')
{
  // 用新上下文：清库 → 播种旧键 → 进应用 → 检查默认学生命名空间
  await navigate(`${BASE}/manifest.json`)
  await evaluate(`
    localStorage.clear()
    localStorage.setItem('word_personal_progress', JSON.stringify({ legacy1: { learnLevel: 3, nextReview: 123 } }))
    localStorage.setItem('wrong_words', JSON.stringify(['legacy1']))
    localStorage.setItem('learn_record', JSON.stringify({ '2026-10-01': 7 }))
  `)
  await navigate(`${BASE}/#/`)
  await waitFor(`!!document.querySelector('.home-page .task-count')`, '迁移后首页')
  const migrated = await evaluate(`
    (() => {
      const id = localStorage.getItem('word_review_current_student')
      return {
        progress: JSON.parse(localStorage.getItem('wr_' + id + '_progress') || '{}'),
        wrong: JSON.parse(localStorage.getItem('wr_' + id + '_wrong') || '[]'),
        records: JSON.parse(localStorage.getItem('wr_' + id + '_records') || '{}'),
        legacyKept: localStorage.getItem('word_personal_progress') !== null
      }
    })()
  `)
  eq('旧进度迁入默认学生', migrated.progress.legacy1.learnLevel, 3)
  eq('旧错题迁入默认学生', migrated.wrong, ['legacy1'])
  eq('旧记录迁入默认学生', migrated.records['2026-10-01'], 7)
  ok('旧键保留可回滚', migrated.legacyKept)
  await go('/wrong')
  await waitFor(`!!document.querySelector('.wrong-page')`, '迁移后错题本')
  const legacyWrong = await exists('.wrong-page .el-table') ? await count('.wrong-page .el-table__body tr') : 0
  ok('迁移的错题页可正常渲染（词库无该 id 时 0 行也正常）', legacyWrong >= 0, String(legacyWrong))
  ok('词库无匹配词时显示空状态而非报错', !(await exists('.wrong-page .el-table')) || legacyWrong > 0)
}

// ================================================================ 8. 双标签页
section('8. 双标签页：storage 事件同步、今日任务不互相覆盖')
let S2 = null
{
  // 干净起点：清库后重新进应用（同一浏览器同源 = 同一份 localStorage）
  await navigate(`${BASE}/manifest.json`)
  await evaluate('localStorage.clear()')
  await navigate(`${BASE}/#/`)
  await waitFor(`!!document.querySelector('.home-page .task-count')`, '双标签页：主标签页首页')

  const tab2 = await openTab(`${BASE}/#/`)
  S2 = tab2.sessionId
  await waitForIn(S2, `!!document.querySelector('.home-page .task-count')`, '第二个标签页首页')
  eq('第二个标签页读到同一份今日任务（0/33）', (await evaluateIn(S2, `document.querySelector('.home-page .task-count').textContent.trim()`)), '0/33')

  const taskIdsOf = sid => evaluateIn(sid, `
    (() => {
      const id = localStorage.getItem('word_review_current_student')
      const t = JSON.parse(localStorage.getItem('wr_' + id + '_tasks') || '{}')
      return Object.values(t)[0]?.ids || []
    })()
  `)
  const ids1 = await taskIdsOf(S)
  const ids2 = await taskIdsOf(S2)
  eq('两个标签页今日任务是同一份', ids2, ids1)
  eq('今日任务仍是 33 词', ids1.length, 33)

  // 第二个标签页学一个词：主标签页靠 storage 事件更新，不整页重载
  await evaluate(`window.__tabMarker = 'alive'`)
  await evaluateIn(S2, `location.hash = '#/study'`)
  await waitForIn(S2, `!!document.querySelector('.flashcard-mode .word-text')`, '第二个标签页翻卡')
  await evaluateIn(S2, `(document.querySelector('.flashcard-wrapper').click(), true)`)
  await waitForIn(S2, `!!document.querySelector('.rating-good')`, '第二个标签页评分按钮')
  await evaluateIn(S2, `(document.querySelector('.rating-good').click(), true)`)
  await waitForIn(S2, `document.querySelector('.progress-badge')?.textContent.includes('1/33')`, '第二个标签页 1/33')

  const synced = await waitForSoft(`document.querySelector('.home-page .task-count')?.textContent.includes('1/33')`, 6000)
  ok('主标签页通过 storage 事件同步到 1/33', synced, await text('.home-page .task-count'))
  ok('主标签页没有整页重载（不是靠 reload 刷新）', await evaluate(`window.__tabMarker === 'alive'`))
  eq('学习后两个标签页仍是同一份任务（没有互相覆盖）', await taskIdsOf(S2), ids1)
  eq('第二个标签页写入的今日任务也是 33 词', (await taskIdsOf(S2)).length, 33)

  // 第二个标签页新建学生 → 主标签页整页重载
  await evaluate(`window.__tabMarker = 'alive'`)
  await evaluateIn(S2, `location.hash = '#/students'`)
  await waitForIn(S2, `!!document.querySelector('.students-page .el-table')`, '第二个标签页学生表')
  await typeIntoIn(S2, '.add-row input', '并发学生')
  const added = await evaluateIn(S2, `
    (() => {
      const b = [...document.querySelectorAll('.add-row button')].find(x => x.textContent.includes('新建档案'))
      if (!b) return false
      b.click()
      return true
    })()
  `)
  ok('第二个标签页新建学生「并发学生」', added)
  await waitForIn(S2, `document.querySelectorAll('.students-page .el-table__body tr').length === 2`, '第二个标签页学生表 2 行')
  ok('学生档案变化后主标签页整页重载', await waitForSoft(`window.__tabMarker === undefined && !!document.querySelector('.home-page .task-count')`, 15000))
  ok('主标签页重载后仍是默认学生（只是列表变了）', (await evaluate(`document.querySelector('.home-page .greeting')?.textContent || ''`)).includes('默认学生'))

  // 第二个标签页切换学生 → 主标签页重载并显示新学生
  await evaluate(`window.__tabMarker = 'alive'`)
  const switched = await evaluateIn(S2, `
    (() => {
      const row = [...document.querySelectorAll('.students-page .el-table__body tr')].find(r => r.textContent.includes('并发学生'))
      if (!row) return false
      const btn = [...row.querySelectorAll('button')].find(b => b.textContent.includes('切换'))
      if (!btn || btn.disabled) return false
      btn.click()
      return true
    })()
  `)
  ok('第二个标签页点击切换学生', switched)
  ok('切换后主标签页重载并显示并发学生', await waitForSoft(`document.querySelector('.home-page .greeting')?.textContent.includes('并发学生')`, 20000))
  ok('主标签页确实重载过（内存标记丢失）', await evaluate(`window.__tabMarker === undefined`))
}

// ================================================================ 9. 触屏滑动
section('9. 移动端触屏滑动（CDP 触摸事件）')
{
  await go('/study')
  await waitFor(`!!document.querySelector('.flashcard-mode .word-text')`, '触屏：翻卡渲染')
  // 多标签页下手动标签页不在前台时 Input.* 事件拿不到 ack 会一直挂起，先把主标签页推到前台
  await browser.send('Page.bringToFront', {}, S)
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true
  }, S)
  await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, S)
  await sleep(400)

  async function swipe(dx, dy) {
    const p = await evaluate(`
      (() => {
        const el = document.querySelector('.flashcard-wrapper')
        if (!el) return null
        el.scrollIntoView({ block: 'center' })
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()
    `)
    if (!p) throw new Error('找不到翻卡元素')
    await browser.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }]
    }, S)
    const steps = 6
    for (let i = 1; i <= steps; i++) {
      await browser.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.round(p.x + (dx * i) / steps), y: Math.round(p.y + (dy * i) / steps) }]
      }, S)
      await sleep(20)
    }
    await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, S)
    await sleep(120)
  }

  const first = await text('.word-text')
  eq('触屏起点计数 0/33', await text('.progress-badge'), '今日任务 0/33')

  // 上滑：答案未显示 → 只翻面
  await swipe(0, -120)
  const flippedUp = await waitForSoft(`!!document.querySelector('.rating-good')`, 3000)
  ok('上滑翻面（答案未显示时只翻面，不评分）', flippedUp)
  eq('上滑后词没变', await text('.word-text'), first)
  eq('上滑后计数仍 0/33', await text('.progress-badge'), '今日任务 0/33')

  // 右滑：已显示答案 → 认识
  await swipe(120, 0)
  await waitFor(`document.querySelector('.progress-badge')?.textContent.includes('1/33')`, '右滑判认识')
  ok('右滑=认识：切到下一个词', (await text('.word-text')) !== first)
  await sleep(400)
  ok('滑动后浏览器补发的 click 被吞掉，下一张卡没被误翻面', !(await exists('.rating-buttons')))

  // 左滑：答案未显示 → 只翻面，不记“不认识”
  const second = await text('.word-text')
  await swipe(-120, 0)
  const flippedLeft = await waitForSoft(`!!document.querySelector('.rating-good')`, 3000)
  ok('左滑翻面（答案未显示时只翻面，不评分）', flippedLeft)
  eq('左滑后词没变', await text('.word-text'), second)
  eq('左滑翻面后计数仍 1/33', await text('.progress-badge'), '今日任务 1/33')

  const wrongBefore = await evaluate(`
    (() => {
      const id = localStorage.getItem('word_review_current_student')
      return JSON.parse(localStorage.getItem('wr_' + id + '_wrong') || '[]').length
    })()
  `)

  // 左滑：已显示答案 → 不认识
  await swipe(-120, 0)
  await waitFor(`document.querySelector('.progress-badge')?.textContent.includes('2/33')`, '左滑判不认识')
  ok('左滑=不认识：切到下一个词', (await text('.word-text')) !== second)
  const wrongAfter = await evaluate(`
    (() => {
      const id = localStorage.getItem('word_review_current_student')
      return JSON.parse(localStorage.getItem('wr_' + id + '_wrong') || '[]').length
    })()
  `)
  eq('「不认识」计入错题本', wrongAfter, wrongBefore + 1)

  // 下滑：未显示 → 翻面；已显示 → 模糊
  const third = await text('.word-text')
  await swipe(0, 120)
  ok('下滑翻面（答案未显示时只翻面）', await waitForSoft(`!!document.querySelector('.rating-good')`, 3000))
  eq('下滑翻面后词没变', await text('.word-text'), third)
  await swipe(0, 120)
  await waitFor(`document.querySelector('.progress-badge')?.textContent.includes('3/33')`, '下滑判模糊')
  ok('下滑=模糊：切到下一个词', (await text('.word-text')) !== third)
  await sleep(400)
  ok('多次滑动后下一张卡仍是正面', !(await exists('.rating-buttons')))

  await browser.send('Emulation.clearDeviceMetricsOverride', {}, S)
  await browser.send('Emulation.setTouchEmulationEnabled', { enabled: false }, S)
}

// ================================================================ 10. 控制台
section('10. 运行期控制台')
{
  ok('无 console.error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  if (consoleWarnings.length) console.log(`  INFO  出现 ${consoleWarnings.length} 条 warning：${consoleWarnings.slice(0, 3).join(' | ')}`)
}

try {
  const shot = await browser.send('Page.captureScreenshot', { format: 'png' }, S)
  fs.writeFileSync(SCRATCH, Buffer.from(shot.data, 'base64'))
  console.log(`\n截图：${SCRATCH}`)
} catch {}

console.log(`\n===== 浏览器自测结果：${pass} 通过，${failures.length} 失败 =====`)
for (const f of failures) console.log(`  失败 ${f}`)

cleanup()
process.exit(failures.length ? 1 : 0)
