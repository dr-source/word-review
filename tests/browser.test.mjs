// 浏览器端端到端自测：无头 Chrome/Edge + CDP 真点页面
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { posKeys, coreMean } from '../src/utils/distractors.js'
import { splitSyllables, stressedSyllable } from '../src/utils/syllable.js'
import { STREAK_TIERS } from '../src/utils/streak.js'

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
// 生产构建在 CI 上把 base 设为 /word-review/（见 vite.config.js），静态服务要跟着挂同一个前缀，
// 否则资源请求全部 404 回落到 index.html，页面白屏
const indexHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
const BASE_PATH = (indexHtml.match(/(?:src|href)="(\/[^"]*?)\/assets\//) || [, ''])[1]
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (BASE_PATH && rel.startsWith(`${BASE_PATH}/`)) rel = rel.slice(BASE_PATH.length)
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
console.log(`静态服务 ${BASE}${BASE_PATH}/ → ${DIST}${BASE_PATH ? `（base ${BASE_PATH}/）` : ''}`)

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

// ---------------------------------------------------------------- 新页面用的取数辅助
const norm = s => String(s || '').replace(/\s+/g, ' ').trim()

/** 读当前学生今天的今日任务（落在 wr_<sid>_tasks 里，键是 bookId） */
const currentTask = () => evaluate(`
  (() => {
    const id = localStorage.getItem('word_review_current_student')
    const all = JSON.parse(localStorage.getItem('wr_' + id + '_tasks') || '{}')
    const list = Object.values(all).filter(Boolean)
    const today = new Date().toLocaleDateString('sv-SE')
    return list.find(t => t.date === today) || list[0] || null
  })()
`)

/**
 * 当前学生正在用的词本：优先 wr_<sid>_book；全新学生没写过这个键，
 * 就退到今日任务里记的 bookId（任务结构里带 bookId）。
 */
const CURRENT_BOOK_JS = `
  const sid = localStorage.getItem('word_review_current_student')
  let bookId = localStorage.getItem('wr_' + sid + '_book')
  if (!bookId) {
    const tasks = Object.values(JSON.parse(localStorage.getItem('wr_' + sid + '_tasks') || '{}') || {}).filter(Boolean)
    const today = new Date().toLocaleDateString('sv-SE')
    const t = tasks.find(x => x.date === today) || tasks[0]
    bookId = (t && t.bookId) || null
  }
`

/**
 * 本地词库里查释义：选择题/测试卷的选项文本就是该词 mean 全文。
 * 只在「当前词本」里查——不同词本可能有同名词，全库 find 会撞错。
 */
const meanOf = word => evaluate(`
  (() => {
    ${CURRENT_BOOK_JS}
    const words = JSON.parse(localStorage.getItem('word_review_local_words') || '[]')
    const pool = bookId ? words.filter(x => x.book_id === bookId) : words
    const hit = pool.find(x => x.word === ${JSON.stringify(word)})
    return hit ? hit.mean : ''
  })()
`)

/**
 * 该词在本地词库里自带的例句（种子词表里大多是空串）。
 * 空串时界面上不该出现「例句：」，有的话必须原样显示——两边都能据此判断。
 */
const storedSentenceOf = word => evaluate(`
  (() => {
    ${CURRENT_BOOK_JS}
    const words = JSON.parse(localStorage.getItem('word_review_local_words') || '[]')
    const pool = bookId ? words.filter(x => x.book_id === bookId) : words
    const hit = pool.find(x => x.word === ${JSON.stringify(word)})
    return (hit && hit.sentence) || ''
  })()
`)

/** 按释义全文点选 QuizMode 的选项（同题 4 项释义互不相同，可唯一定位） */
const pickQuizOption = mean => evaluate(`
  (() => {
    const target = ${JSON.stringify(norm(mean))}
    const el = [...document.querySelectorAll('.quiz-option')]
      .find(o => (o.querySelector('.option-text')?.textContent || '').replace(/\s+/g, ' ').trim() === target)
    if (!el) return false
    el.click()
    return true
  })()
`)

// 复刻 src/utils/wordStore 里给词条补例句的兜底：sentence || sentences.json 速查表
const SENTENCE_MAP = (() => {
  const raw = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'src', 'utils', 'defaultWords.json'), 'utf8'))
  const map = new Map()
  for (const w of raw) {
    if (w.sentence && String(w.sentence).trim().length > 8) map.set(String(w.word).toLowerCase(), w.sentence)
  }
  return map
})()
const sentenceOf = (word, stored) => stored || SENTENCE_MAP.get(String(word || '').toLowerCase()) || ''

/**
 * 「该不该显示例句」的断言：词库里有例句就必须原样显示出来，
 * 没有例句时界面不该凭空编一句。两个方向都查，避免断言恒真。
 */
function assertSentence(label, expect, shown) {
  const want = norm(expect)
  const got = norm(shown)
  ok(label, want ? got.includes(want.slice(0, 24)) : got === '',
    `期望「${want || '（无例句）'}」实际「${got || '（空）'}」`)
}

/** 复刻 src/utils/cloze.js 的 maskSentence，用来判断完形填空哪一项才是正确答案 */
function maskSentence(sentence, word) {
  const text = String(sentence || '')
  const target = String(word || '')
  if (!text || target.length < 2) return ''
  const escapeReg = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const exactRe = () => new RegExp(`\\b${escapeReg(target)}\\b`, 'gi')
  if (exactRe().test(text)) return text.replace(exactRe(), '______')
  const stem = target.replace(/[ey]$/i, '')
  if (stem.length >= 3) {
    const looseRe = () => new RegExp(`\\b${escapeReg(stem)}\\w*`, 'gi')
    if (looseRe().test(text)) return text.replace(looseRe(), '______')
  }
  return ''
}

/** 完形填空：谁的例句挖掉自己正好等于题面，谁就是正确选项，点它 */
async function answerCloze() {
  const info = await evaluate(`
    (() => {
      ${CURRENT_BOOK_JS}
      const words = JSON.parse(localStorage.getItem('word_review_local_words') || '[]')
      const pool = bookId ? words.filter(x => x.book_id === bookId) : words
      const stored = new Map(pool.map(w => [String(w.word).toLowerCase(), w.sentence || '']))
      return {
        sentence: document.querySelector('.cloze-sentence')?.textContent || '',
        options: [...document.querySelectorAll('.cloze-option')].map(o => {
          const word = (o.querySelector('.option-word')?.textContent || '').trim()
          return { word, stored: stored.get(word.toLowerCase()) || '' }
        })
      }
    })()
  `)
  const shown = norm(info.sentence)
  const hit = info.options.find(o => norm(maskSentence(sentenceOf(o.word, o.stored), o.word)) === shown)
  if (!hit) {
    throw new Error(`完形填空找不到正确选项：题面「${shown}」选项 ${JSON.stringify(info.options)}`)
  }
  const clicked = await evaluate(`
    (() => {
      const word = ${JSON.stringify(hit.word)}
      const el = [...document.querySelectorAll('.cloze-option')]
        .find(o => (o.querySelector('.option-word')?.textContent || '').trim() === word)
      if (!el) return false
      el.click()
      return true
    })()
  `)
  return { word: hit.word, clicked }
}

/** 今日单词表：读出整张表（td 顺序：# / 单词 / 音标 / 音节 / 释义 / 例句 / 发音） */
async function readDailyTable() {
  await go('/daily-words')
  await waitFor(`document.querySelectorAll('.daily-words-page .cell-word').length === 40`, '今日单词表 40 行')
  return evaluate(`
    (() => {
      const page = document.querySelector('.daily-words-page')
      const rows = [...page.querySelectorAll('.el-table__body tr')]
        .map(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent || '').replace(/\\s+/g, ' ').trim()))
      return {
        sub: (page.querySelector('.page-sub')?.textContent || '').replace(/\\s+/g, ' ').trim(),
        rows,
        words: [...page.querySelectorAll('.cell-word')].map(e => e.textContent.trim())
      }
    })()
  `)
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
  eq('首页今日任务 0/40', await text('.task-count'), '0/40')
  ok('首页说明三种模式同源', (await text('.task-desc')).includes('翻卡 / 选择 / 拼写同一批词'))
  const task = await currentTask()
  eq('今日任务词数 40（默认每日任务量）', task?.ids?.length, 40)
  ok('任务日期为今天', /^\d{4}-\d{2}-\d{2}$/.test(task?.date || '') && task.date === new Date().toLocaleDateString('sv-SE'))
}

// ================================================================ 2. 翻卡
section('2. 翻卡模式：学一词，跨页面计数同步')
let firstWord = ''
{
  await go('/study')
  await waitFor(`!!document.querySelector('.flashcard-mode .word-text')`, '翻卡单词')
  eq('翻卡进度 0/40', await text('.progress-badge'), '今日任务 0/40')
  firstWord = await text('.word-text')
  ok('翻卡显示了单词', firstWord.length > 0, firstWord)
  ok('翻卡正面只有英文单词（中文释义不再上卡）', /^[A-Za-z][A-Za-z' -]*$/.test(firstWord), firstWord)
  ok('翻卡正面不渲染中文释义节点', !(await exists('.word-meaning')))
  await click('.flashcard-wrapper')
  await waitFor(`!!document.querySelector('.rating-good')`, '评分按钮')
  ok('翻面后也不显示中文释义节点', !(await exists('.word-meaning')))
  // 词库里有例句就必须显示；没有例句时给的是「去今日单词表对释义」的提示
  const backSentence = await storedSentenceOf(firstWord)
  const expectBack = sentenceOf(firstWord, backSentence)
  const backText = await text('.word-sentence')
  const backMuted = await evaluate(`!!document.querySelector('.word-sentence.muted')`)
  ok('翻面后：有例句就显示例句，没例句就给看释义的提示',
    expectBack ? (backText.includes(expectBack.slice(0, 24)) && !backMuted) : backMuted,
    `期望「${expectBack || '（无例句→提示）'}」实际「${backText}」 muted=${backMuted}`)
  await click('.rating-good')
  await waitFor(`document.querySelector('.progress-badge')?.textContent.includes('1/40')`, '翻卡计数 +1')
  ok('翻卡切到下一个词', (await text('.word-text')) !== firstWord)
  const barTag = await text('.student-bar')
  ok('背诵页顶部任务计数同步为 1/40', barTag.includes('今日任务 1/40 词'), barTag)

  await go('/')
  await waitFor(`document.querySelector('.home-page .task-count')?.textContent.includes('1/40')`, '首页计数同步')
  ok('返回首页进度保持 1/40', true)
}

// ================================================================ 3. 三模式同源
section('3. 三种模式取词/取义一致')
{
  const mean = await meanOf(firstWord)
  ok('本地词库能查到该词释义', mean.length > 0)

  await go('/study')
  await waitFor(`!!document.querySelector('.flashcard-mode .word-text')`, '翻卡重新渲染')
  eq('重新进入翻卡，首词不变', await text('.word-text'), firstWord)

  // 选择题
  await clickByText('.mode-selector .el-radio-button', '选择')
  await waitFor(`!!document.querySelector('.quiz-mode .quiz-word')`, '选择题渲染')
  eq('选择题首词与翻卡一致', await text('.quiz-word'), firstWord)
  eq('选择题进度从 0 开始', await text('.quiz-progress'), '今日任务 0/40')
  const clicked = await pickQuizOption(mean)
  ok('选择题里能找到该词释义作为选项', clicked)
  ok('只点选项不立刻判对错（先选中）', await exists('.quiz-option.option-pending'))
  ok('未确认时没有反馈区', !(await exists('.quiz-feedback')))

  // 手滑点错可以撤销：再点同一项即取消选中
  await pickQuizOption(mean)
  ok('再点同一项可以取消选中', !(await exists('.quiz-option.option-pending')))
  ok('取消选中后确认按钮变灰', await evaluate(`!!document.querySelector('.quiz-confirm')?.disabled`))
  await pickQuizOption(mean)
  ok('重新选中后恢复待提交状态', await exists('.quiz-option.option-pending'))

  ok('确认按钮在选中后才可点', await evaluate(`(() => {
    const btn = document.querySelector('.quiz-confirm')
    return !!btn && !btn.disabled
  })()`))
  await click('.quiz-confirm')
  await waitFor(`!!document.querySelector('.quiz-feedback')`, '选择题反馈')
  // 例句跟着词库走：有例句就必须显示，没有就不该出现「例句：」
  const quizExpectSentence = sentenceOf(firstWord, await storedSentenceOf(firstWord))
  const quizSentence = (await exists('.quiz-sentence')) ? await text('.quiz-sentence') : ''
  ok('提交后按词库显示（或不显示）语境例句',
    quizExpectSentence ? quizSentence.includes(quizExpectSentence.slice(0, 24)) : quizSentence === '',
    `期望「${quizExpectSentence || '（无例句）'}」实际「${quizSentence || '（空）'}」`)
  ok('选择正确释义后判对', await exists('.feedback-correct'))
  await waitFor(`document.querySelector('.quiz-progress')?.textContent.includes('1/40')`, '选择题计数 +1')
  const barTag = await text('.student-bar')
  ok('选择题答对后顶部计数为 1/40（同词去重只加一次）', barTag.includes('今日任务 1/40 词'), barTag)

  // 拼写：默认手写板 + 自评
  await clickByText('.mode-selector .el-radio-button', '拼写')
  await waitFor(`!!document.querySelector('.spelling-mode .mean-display')`, '拼写渲染')
  eq('拼写首词释义与翻卡同词', await text('.mean-display'), mean)
  ok('拼写默认是手写板', (await exists('.spelling-mode .pad-canvas')) && !(await exists('.input-row input')))
  ok('手写板一开始是空的（有占位提示）', await exists('.pad-placeholder'))
  ok('切换按钮当前提示可以改用键盘', (await text('.handwrite-toggle')).includes('改用键盘'))
  const phonetic = await evaluate(`
    (() => {
      const words = JSON.parse(localStorage.getItem('word_review_local_words') || '[]')
      const w = words.find(x => x.word === ${JSON.stringify(firstWord)})
      return w ? (w.phonetic || '') : ''
    })()
  `)
  if (phonetic) {
    ok('拼写卡不给音标（避免照着音标抄）', !(await text('.spelling-mode')).includes(phonetic), phonetic)
  }

  // 在画布上真画一笔：空状态消失才算写进去了
  await evaluate(`
    (() => {
      const canvas = document.querySelector('.pad-canvas')
      if (!canvas) return false
      const r = canvas.getBoundingClientRect()
      const at = (dx, dy) => ({
        clientX: Math.round(r.left + dx), clientY: Math.round(r.top + dy),
        pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true
      })
      canvas.dispatchEvent(new PointerEvent('pointerdown', at(30, 60)))
      canvas.dispatchEvent(new PointerEvent('pointermove', at(60, 90)))
      canvas.dispatchEvent(new PointerEvent('pointermove', at(90, 50)))
      canvas.dispatchEvent(new PointerEvent('pointerup', at(90, 50)))
      return true
    })()
  `)
  ok('手写一笔后占位提示消失', await waitForSoft(`!document.querySelector('.pad-placeholder')`, 3000))
  await click('.pad-check')
  await waitFor(`!!document.querySelector('.self-check .answer-word')`, '手写对答案')
  eq('对答案给出正确拼写', await text('.self-check .answer-word'), firstWord)
  await click('.self-right')
  await waitFor(`!!document.querySelector('.result-correct')`, '手写自评判对')
  ok('手写自评「我写对了」判对', await exists('.result-correct'))
  const barTag2 = await text('.student-bar')
  ok('拼写答对同一词后顶部计数仍为 1/40', barTag2.includes('今日任务 1/40 词'), barTag2)

  // 切到键盘模式再答错一个新词
  await clickByText('.spelling-result button', '下一题')
  await waitFor(`!!document.querySelector('.mean-display') && !document.querySelector('.spelling-result')`, '拼写下一题')
  const secondMean = await text('.mean-display')
  ok('下一题换了新词', secondMean !== mean, secondMean)
  await click('.handwrite-toggle')
  await waitFor(`!!document.querySelector('.input-row input')`, '切到键盘输入')
  ok('切到键盘后手写板消失', !(await exists('.pad-canvas')))
  await typeInto('.input-row input', 'zzzz')
  await click('.input-row button')
  await waitFor(`!!document.querySelector('.result-wrong')`, '拼写判错')
  ok('拼写答错显示正确答案', (await text('.result-wrong')).includes('正确答案'))
  ok('拼写答错提示会再出现', await exists('.retry-hint'))
  const barTag3 = await text('.student-bar')
  ok('答错新词后顶部计数为 2/40', barTag3.includes('今日任务 2/40 词'), barTag3)
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
    if (bar.includes('今日任务 3/40')) break
    if (!(await exists('.rating-good'))) await click('.flashcard-wrapper')
    await waitFor(`!!document.querySelector('.rating-good')`, '评分按钮')
    await click('.rating-good')
    await sleep(500)
  }
  await waitFor(`document.querySelector('.student-bar')?.textContent.includes('3/40')`, '新词计数 3/40')

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
  eq('新学生今日任务从 0 开始', await text('.task-count'), '0/40')
  eq('新学生为空任务也生成 40 词', (await currentTask())?.ids?.length, 40)

  // 张小明学一词
  await go('/study')
  await waitFor(`!!document.querySelector('.flashcard-mode .word-text')`, '张小明翻卡')
  await click('.flashcard-wrapper')
  await waitFor(`!!document.querySelector('.rating-good')`, '张小明评分')
  await click('.rating-good')
  await waitFor(`document.querySelector('.student-bar')?.textContent.includes('1/40')`, '张小明计数 1/40')
  await go('/')
  await waitFor(`document.querySelector('.home-page .task-count')?.textContent.includes('1/40')`, '张小明首页 1/40')

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
  eq('默认学生进度保留 3/40', await text('.task-count'), '3/40')
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
  eq('第二个标签页读到同一份今日任务（0/40）', (await evaluateIn(S2, `document.querySelector('.home-page .task-count').textContent.trim()`)), '0/40')

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
  eq('今日任务仍是 40 词', ids1.length, 40)

  // 第二个标签页学一个词：主标签页靠 storage 事件更新，不整页重载
  await evaluate(`window.__tabMarker = 'alive'`)
  await evaluateIn(S2, `location.hash = '#/study'`)
  await waitForIn(S2, `!!document.querySelector('.flashcard-mode .word-text')`, '第二个标签页翻卡')
  await evaluateIn(S2, `(document.querySelector('.flashcard-wrapper').click(), true)`)
  await waitForIn(S2, `!!document.querySelector('.rating-good')`, '第二个标签页评分按钮')
  await evaluateIn(S2, `(document.querySelector('.rating-good').click(), true)`)
  await waitForIn(S2, `document.querySelector('.progress-badge')?.textContent.includes('1/40')`, '第二个标签页 1/40')

  const synced = await waitForSoft(`document.querySelector('.home-page .task-count')?.textContent.includes('1/40')`, 6000)
  ok('主标签页通过 storage 事件同步到 1/40', synced, await text('.home-page .task-count'))
  ok('主标签页没有整页重载（不是靠 reload 刷新）', await evaluate(`window.__tabMarker === 'alive'`))
  eq('学习后两个标签页仍是同一份任务（没有互相覆盖）', await taskIdsOf(S2), ids1)
  eq('第二个标签页写入的今日任务也是 40 词', (await taskIdsOf(S2)).length, 40)

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

  // 用完就关：留着的标签页会在后面各节清库时靠 storage 事件把旧数据写回来，制造竞态
  await browser.send('Target.closeTarget', { targetId: tab2.targetId })
  sessions.delete(S2)
  S2 = null
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
  eq('触屏起点计数 0/40', await text('.progress-badge'), '今日任务 0/40')

  // 上滑：答案未显示 → 只翻面
  await swipe(0, -120)
  const flippedUp = await waitForSoft(`!!document.querySelector('.rating-good')`, 3000)
  ok('上滑翻面（答案未显示时只翻面，不评分）', flippedUp)
  eq('上滑后词没变', await text('.word-text'), first)
  eq('上滑后计数仍 0/40', await text('.progress-badge'), '今日任务 0/40')

  // 右滑：已显示答案 → 认识
  await swipe(120, 0)
  await waitFor(`document.querySelector('.progress-badge')?.textContent.includes('1/40')`, '右滑判认识')
  ok('右滑=认识：切到下一个词', (await text('.word-text')) !== first)
  await sleep(400)
  ok('滑动后浏览器补发的 click 被吞掉，下一张卡没被误翻面', !(await exists('.rating-buttons')))

  // 左滑：答案未显示 → 只翻面，不记“不认识”
  const second = await text('.word-text')
  await swipe(-120, 0)
  const flippedLeft = await waitForSoft(`!!document.querySelector('.rating-good')`, 3000)
  ok('左滑翻面（答案未显示时只翻面，不评分）', flippedLeft)
  eq('左滑后词没变', await text('.word-text'), second)
  eq('左滑翻面后计数仍 1/40', await text('.progress-badge'), '今日任务 1/40')

  const wrongBefore = await evaluate(`
    (() => {
      const id = localStorage.getItem('word_review_current_student')
      return JSON.parse(localStorage.getItem('wr_' + id + '_wrong') || '[]').length
    })()
  `)

  // 左滑：已显示答案 → 不认识
  await swipe(-120, 0)
  await waitFor(`document.querySelector('.progress-badge')?.textContent.includes('2/40')`, '左滑判不认识')
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
  await waitFor(`document.querySelector('.progress-badge')?.textContent.includes('3/40')`, '下滑判模糊')
  ok('下滑=模糊：切到下一个词', (await text('.word-text')) !== third)
  await sleep(400)
  ok('多次滑动后下一张卡仍是正面', !(await exists('.rating-buttons')))

  await browser.send('Emulation.clearDeviceMetricsOverride', {}, S)
  await browser.send('Emulation.setTouchEmulationEnabled', { enabled: false }, S)
}

// ================================================================ 10. 乱序开关 + 今日单词表
section('10. 乱序抽查开关可点、今日单词表整表可读')
{
  await navigate(`${BASE}/manifest.json`)
  await evaluate('localStorage.clear()')
  await navigate(`${BASE}/#/`)
  await waitFor(`!!document.querySelector('.home-page .task-count')`, '乱序：首页')
  await go('/study')
  await waitFor(`!!document.querySelector('.flashcard-mode .word-text')`, '乱序：翻卡')

  // 开关手感靠 CSS：核心至少 54×26，整行至少 44px 高（触屏最小热区）
  const box = await evaluate(`
    (() => {
      const core = document.querySelector('.shuffle-switch .el-switch__core')
      const row = document.querySelector('.shuffle-item')
      if (!core || !row) return null
      const c = core.getBoundingClientRect()
      return {
        coreW: Math.round(c.width),
        coreH: Math.round(c.height),
        rowH: Math.round(row.getBoundingClientRect().height)
      }
    })()
  `)
  ok('乱序开关热区已放大（核心 >=54×26，整行 >=44 高）',
    box && box.coreW >= 54 && box.coreH >= 26 && box.rowH >= 44, JSON.stringify(box))
  ok('默认不乱序：学生栏没有「乱序」标签', !(await text('.student-bar')).includes('乱序'))

  // 今日单词表：40 词整表摊开，英文 / 音标 / 音节 / 中文释义 / 例句 都在
  const before = await readDailyTable()
  eq('今日单词表 40 行', before.rows.length, 40)
  ok('今日单词表副标题标出 40 词', before.sub.includes('共 40 词'), before.sub)
  eq('今日单词表 40 个单词列', before.words.length, 40)
  ok('单词列只有英文（不掺中文）',
    before.words.every(w => /^[A-Za-z][A-Za-z' -]*$/.test(w)), before.words.slice(0, 5).join('|'))
  ok('每一行都有中文释义',
    before.rows.every(c => /[\u4e00-\u9fa5]/.test(c[4] || '')),
    JSON.stringify(before.rows.slice(0, 2)))
  ok('释义列带词性（n. / v. / adj. 之类）',
    before.rows.filter(c => /(^|\s)(n|v|vt|vi|adj|adv|prep|conj|pron)\./.test(c[4] || '')).length >= 30,
    before.rows.filter(c => /(^|\s)(n|v|vt|vi|adj|adv|prep|conj|pron)\./.test(c[4] || '')).length + ' 行带词性')
  ok('多音节词在音节列用 · 切分',
    before.rows.filter(c => (c[3] || '').includes('·')).length >= 1,
    before.rows.filter(c => (c[3] || '').includes('·')).slice(0, 3).map(c => c[1] + '=' + c[3]).join('|'))
  ok('例句列大部分是真例句（不是占位符）',
    before.rows.filter(c => (c[5] || '').length > 10).length >= 15,
    before.rows.filter(c => (c[5] || '').length > 10).length + ' 行有例句')
  ok('发音列每行都有按钮', (await count('.daily-words-page .cell-speak')) === 40)
  ok('表头有「今日单词表」标题', (await text('.daily-words-page .page-title')) === '今日单词表')

  // 点开关核心：必须真的切换（is-checked + 头部标签 + 顺序变化）
  await go('/study')
  await waitFor(`!!document.querySelector('.shuffle-switch .el-switch__core')`, '回背诵页')
  await click('.shuffle-switch .el-switch__core')
  await waitFor(`document.querySelector('.shuffle-switch')?.classList.contains('is-checked')`, '乱序开关选中')
  ok('开启后学生栏出现「乱序」标签',
    await waitForSoft(`document.querySelector('.student-bar')?.textContent.includes('乱序')`, 4000),
    await text('.student-bar'))
  const after = await readDailyTable()
  eq('乱序后仍是同一批 40 词', [...after.words].sort().join(','), [...before.words].sort().join(','))
  ok('乱序后顺序确实变了', after.words.join(',') !== before.words.join(','),
    `${before.words.slice(0, 3)} → ${after.words.slice(0, 3)}`)

  // 再点一次关掉：开关回到未选中，顺序复原
  await go('/study')
  await waitFor(`!!document.querySelector('.shuffle-switch .el-switch__core')`, '回背诵页关乱序')
  await click('.shuffle-switch .el-switch__core')
  await waitFor(`!document.querySelector('.shuffle-switch')?.classList.contains('is-checked')`, '乱序开关取消')
  ok('关闭后「乱序」标签消失',
    await waitForSoft(`!document.querySelector('.student-bar')?.textContent.includes('乱序')`, 4000),
    await text('.student-bar'))
  const back = await readDailyTable()
  eq('关闭乱序后顺序复原', back.words, before.words)
}

// ================================================================ 11. 老种子词补例句（独立上下文）
section('11. 老版本种子词升级时补例句')
{
  await navigate(`${BASE}/manifest.json`)
  await evaluate(`
    localStorage.clear()
    localStorage.setItem('word_review_local_books', JSON.stringify([
      { id: 'book_legacy', name: '中考英语核心高频688词汇表', created_at: '2024-01-01T00:00:00.000Z' }
    ]))
    localStorage.setItem('word_review_default_book_id', 'book_legacy')
    localStorage.setItem('word_review_default_seed_version', '3')
    localStorage.setItem('word_review_exam_seed_version', '1')
    localStorage.setItem('word_review_local_words', JSON.stringify([
      { id: 'word_legacy_value', book_id: 'book_legacy', word: 'value', phonetic: 'ˈvæljuː',
        mean: 'n. 价值；面值 v. 估价，评价', sentence: '', created_at: '2024-01-01T00:00:01.000Z' },
      { id: 'word_legacy_wear', book_id: 'book_legacy', word: 'wear', phonetic: 'weə(r)',
        mean: 'v. 穿着，戴着', sentence: '我自己写的例句：He wears a hat.', created_at: '2024-01-01T00:00:02.000Z' }
    ]))
  `)
  await navigate(`${BASE}/#/`)
  await waitFor(`!!document.querySelector('.home-page .task-count')`, '补例句：首页')
  const legacy = await evaluate(`
    (() => {
      const words = JSON.parse(localStorage.getItem('word_review_local_words') || '[]')
      const own = words.filter(x => x.book_id === 'book_legacy')
      const find = w => own.filter(x => x.word === w)[0] || null
      return { value: find('value'), wear: find('wear'), total: own.length, valueCount: own.filter(x => x.word === 'value').length }
    })()
  `)
  ok('老种子词缺例句时按词库补上', (legacy.value?.sentence || '').length > 10, legacy.value?.sentence || '（空）')
  eq('用户自己写的例句不被覆盖', legacy.wear?.sentence, '我自己写的例句：He wears a hat.')
  eq('种子版本已是最新时不重复播种（自定义词本仍 2 个词）', legacy.total, 2)
  eq('补例句不会把同名词插成两条', legacy.valueCount, 1)
  ok('补例句后应用正常渲染', await exists('.home-page .task-count'))
}

// ================================================================ 12. 五种模式都能出题
section('12. 五种练习模式都能出题、连对 3 题给 Good 闪光')
{
  await navigate(`${BASE}/manifest.json`)
  await evaluate('localStorage.clear()')
  await navigate(`${BASE}/#/`)
  await waitFor(`!!document.querySelector('.home-page .task-count')`, '五模式：首页')
  await go('/study')
  await waitFor(`document.querySelectorAll('.mode-selector .el-radio-button').length === 5`, '五种练习模式')

  eq('背诵页给了 5 种模式', await count('.mode-selector .el-radio-button'), 5)
  const modeText = await text('.mode-selector')
  ok('模式里有完形填空', modeText.includes('完形'), modeText)
  ok('模式里有音节拼读', modeText.includes('音节'), modeText)
  ok('背诵页带「今日单词表」入口',
    (await text('.entry-row .entry-daily')).includes('今日单词表'), await text('.entry-row .entry-daily'))
  ok('背诵页带「100 词测试卷」入口',
    (await text('.entry-row .entry-exam')).includes('100 词测试卷'), await text('.entry-row .entry-exam'))

  // 音节模式：切出音节片 + 中文释义，能翻到下一个词
  ok('切到音节模式', await clickByText('.mode-selector .el-radio-button', '音节'))
  await waitFor(`!!document.querySelector('.syllable-word')`, '音节模式出题')
  const syl = await evaluate(`
    (() => ({
      word: (document.querySelector('.syllable-word')?.textContent || '').trim(),
      mean: (document.querySelector('.syllable-mean')?.textContent || '').trim(),
      chips: [...document.querySelectorAll('.syllable-chip')].length,
      empty: !!document.querySelector('.syllable-empty'),
      progress: (document.querySelector('.syllable-progress')?.textContent || '').trim()
    }))()
  `)
  ok('音节模式给出的单词是英文', /^[A-Za-z][A-Za-z' -]*$/.test(syl.word), syl.word)
  ok('音节模式同时给出中文释义', /[\u4e00-\u9fa5]/.test(syl.mean), syl.mean)
  ok('有音标的词切出音节片，没音标的给出提示', syl.chips >= 1 || syl.empty,
    `chips=${syl.chips} empty=${syl.empty}`)
  eq('音节模式从第 1 个词开始', syl.progress, '1/40')
  ok('点「下一个」翻到第 2 个词', await clickByText('.syllable-nav button', '下一个'))
  await waitFor(`(document.querySelector('.syllable-progress')?.textContent || '').trim() === '2/40'`, '音节翻到第 2 个')
  ok('翻页后仍是英文单词 + 中文释义',
    /[\u4e00-\u9fa5]/.test(await text('.syllable-mean')), await text('.syllable-mean'))

  // 完形填空：挖空的例句 + 四个选项，选对了给单词和释义
  ok('切到完形模式', await clickByText('.mode-selector .el-radio-button', '完形'))
  await waitFor(`!!document.querySelector('.cloze-sentence')`, '完形模式出题')
  await waitFor(`document.querySelectorAll('.cloze-option').length === 4`, '完形四个选项')
  const clozeProgress0 = await text('.cloze-progress')
  const clozeSentence0 = await text('.cloze-sentence')
  ok('完形题面留了空格', clozeSentence0.includes('______'), clozeSentence0)
  const cloze = await answerCloze()
  ok('完形点到了正确选项', cloze.clicked, JSON.stringify(cloze))
  await waitFor(`!!document.querySelector('.cloze-feedback .feedback-correct')`, '完形答对')
  const clozeMean = await text('.cloze-feedback .cloze-mean')
  ok('答对后给出单词本身', clozeMean.toLowerCase().includes(cloze.word.toLowerCase()), clozeMean)
  ok('答对后给出中文释义', /[\u4e00-\u9fa5]/.test(clozeMean), clozeMean)
  ok('点「下一题」进入下一道完形', await clickByText('.cloze-feedback button', '下一题'))
  const [clozeDone, clozeTotal] = clozeProgress0.split('/')
  await waitFor(
    `(document.querySelector('.cloze-progress')?.textContent || '').trim() === '${Number(clozeDone) + 1}/${clozeTotal}'`,
    '完形翻到下一题'
  )
  ok('下一道完形也是挖空例句', (await text('.cloze-sentence')).includes('______'), await text('.cloze-sentence'))

  // 选择题：连答对 3 题，出现 3 连对 + Good 闪光
  ok('切到选择模式', await clickByText('.mode-selector .el-radio-button', '选择'))
  await waitFor(`!!document.querySelector('.quiz-word')`, '选择模式出题')
  for (let q = 1; q <= 3; q++) {
    const word = await text('.quiz-word')
    const mean = await meanOf(word)
    ok(`选择题第 ${q} 题查到释义`, !!mean, `${word} → ${mean || '（空）'}`)
    ok(`选择题第 ${q} 题点中正确释义`, await pickQuizOption(mean), mean)
    await waitFor(`(() => { const b = document.querySelector('.quiz-confirm'); return !!b && !b.disabled })()`,
      `选择题第 ${q} 题确认按钮解锁`)
    await click('.quiz-confirm')
    await waitFor(`!!document.querySelector('.quiz-feedback')`, `选择题第 ${q} 题反馈`)
    ok(`选择题第 ${q} 题答对`, !!(await exists('.quiz-feedback .feedback-correct')), await text('.quiz-feedback'))
    assertSentence(`选择题第 ${q} 题的反馈例句跟词库一致`,
      sentenceOf(word, await storedSentenceOf(word)),
      (await exists('.quiz-sentence')) ? await text('.quiz-sentence') : '')
    if (q < 3) {
      ok(`选择题第 ${q} 题点「下一题」`, await clickByText('.quiz-feedback button', '下一题'))
      await waitFor(`!!document.querySelector('.quiz-actions .quiz-confirm')`, `选择题第 ${q} 题翻页`)
    }
  }
  ok('3 连对时头部显示「🔥 3 连对」', (await text('.quiz-streak')).includes('3 连对'), await text('.quiz-streak'))
  ok('3 连对触发 Good 闪光',
    await waitForSoft(`(document.querySelector('.streak-flash .streak-label')?.textContent || '').trim() === 'Good'`, 4000),
    await text('.streak-flash'))
}

// ================================================================ 13. 100 词测试卷
section('13. 100 词测试卷：全对 → 100 分 Excellent')
{
  await go('/exam')
  await waitFor(`!!document.querySelector('.exam-intro')`, '测试卷开始页')
  await waitFor(`(document.querySelector('.exam-intro .intro-text')?.textContent || '').includes('100')`, '测试卷按 100 题出')
  ok('开始页写明 100 题、满分 100 分',
    (await text('.exam-intro .intro-text')).includes('满分 100 分'), await text('.exam-intro .intro-text'))
  ok('评级规则写明 100 分 → Excellent', (await text('.intro-rules')).includes('Excellent'), await text('.intro-rules'))
  ok('开始按钮可用', !(await evaluate(`!!document.querySelector('.exam-start')?.disabled`)))
  await click('.exam-start')
  await waitFor(`!!document.querySelector('.exam-word')`, '测试卷第 1 题')
  eq('测试卷第 1 题进度', await text('.exam-progress'), '第 1 / 100 题')

  // 100 题一次性在页面里答完：每题按当前词的释义点选项，再点下一题（末题交卷）
  const run = await evaluate(`
    (async () => {
      ${CURRENT_BOOK_JS}
      const words = JSON.parse(localStorage.getItem('word_review_local_words') || '[]')
      const pool = bookId ? words.filter(x => x.book_id === bookId) : words
      const byWord = new Map()
      for (const w of pool) {
        const key = String(w.word || '').toLowerCase()
        if (!byWord.has(key)) byWord.set(key, [])
        byWord.get(key).push(String(w.mean || ''))
      }
      const N = t => String(t || '').replace(/\\s+/g, ' ').trim()
      const tick = () => new Promise(r => setTimeout(r, 20))
      const total = 100
      for (let q = 0; q < total; q++) {
        const word = N(document.querySelector('.exam-word')?.textContent)
        const cands = (byWord.get(String(word).toLowerCase()) || []).map(N).filter(Boolean)
        const opts = [...document.querySelectorAll('.exam-option')]
        if (!cands.length || opts.length !== 4) {
          return { ok: false, at: q + 1, word, cands, optCount: opts.length,
            options: opts.map(o => N(o.textContent)) }
        }
        const hit = opts.filter(o => cands.includes(N(o.querySelector('.option-text')?.textContent)))
        if (hit.length !== 1) {
          return { ok: false, at: q + 1, word, cands,
            options: opts.map(o => N(o.querySelector('.option-text')?.textContent)) }
        }
        hit[0].click()
        await tick()
        if (!hit[0].classList.contains('is-picked')) {
          return { ok: false, at: q + 1, word, reason: '点了选项却没选中' }
        }
        const buttons = [...document.querySelectorAll('.exam-actions button')]
        const btn = buttons.find(b => (b.textContent || '').includes('下一题')) ||
                    buttons.find(b => (b.textContent || '').includes('交卷'))
        if (!btn) return { ok: false, at: q + 1, word, reason: '没有下一题/交卷按钮' }
        btn.click()
        await tick()
        if (q < total - 1) {
          const prog = N(document.querySelector('.exam-progress')?.textContent)
          const want = '第 ' + (q + 2) + ' / ' + total + ' 题'
          if (prog !== want) return { ok: false, at: q + 1, word, reason: '进度没往前走：' + prog + ' ≠ ' + want }
        }
      }
      return { ok: true }
    })()
  `)
  ok('100 题全部按正确释义作答', run?.ok, JSON.stringify(run))
  await waitFor(`!!document.querySelector('.exam-result')`, '测试卷出成绩')
  ok('满分 100 / 100', (await text('.result-score')).includes('100 / 100'), await text('.result-score'))
  eq('100 分评级 Excellent', await text('.result-grade'), 'Excellent')
  ok('满分时不出现错词卡片', !(await exists('.exam-result .wrong-card')))
  ok('成绩页可以再测一次', await exists('.exam-again'))
}

// ================================================================ 14. 完成一天任务后的鼓励语
section('14. 完成后弹鼓励语（翻卡页 + 首页）')
{
  await navigate(`${BASE}/manifest.json`)
  await evaluate('localStorage.clear()')
  await navigate(`${BASE}/#/`)
  await waitFor(`!!document.querySelector('.home-page .task-count')`, '鼓励语：首页')
  // 把当天任务量降到 5 词，并清掉已生成的任务，让重载后按 5 词重排
  await evaluate(`
    (() => {
      const id = localStorage.getItem('word_review_current_student')
      localStorage.setItem('wr_' + id + '_settings', JSON.stringify({ dailySize: 5, shuffle: false }))
      localStorage.removeItem('wr_' + id + '_tasks')
    })()
  `)
  // 同 URL 的 hash 跳转不会真的重载，必须 Page.reload 才能让 store 重新读设置
  await browser.send('Page.reload', {}, S)
  await sleep(300)
  await waitFor(`document.querySelector('.home-page .task-count')?.textContent.trim() === '0/5'`, '鼓励语：按 5 词重排')
  eq('任务量改成 5 词', await text('.home-page .task-count'), '0/5')
  ok('任务没做完时首页不弹鼓励卡片', !(await exists('.home-page .finish-card')))

  await go('/study')
  await waitFor(`!!document.querySelector('.flashcard-mode .word-text')`, '鼓励语：翻卡')
  // 逐词翻面 + 评「认识」，直到 5 词做完（评分后有短暂锁定，要等按钮解锁再点）
  let guard = 0
  while (!(await exists('.flashcard-mode .encouragement')) && guard++ < 30) {
    if (!(await exists('.rating-good'))) {
      await evaluate(`(document.querySelector('.flashcard-wrapper').click(), true)`)
      await waitFor(`!!document.querySelector('.rating-good')`, '翻面')
    }
    await waitFor(`(() => { const b = document.querySelector('.rating-good'); return !!b && !b.disabled })()`, '评分按钮解锁', 6000)
    await evaluate(`(document.querySelector('.rating-good').click(), true)`)
    await sleep(150)
  }
  ok('五词都评完（没有卡在某一词上）', guard < 30, String(guard))

  await waitFor(`!!document.querySelector('.flashcard-mode .encouragement .encourage-main')`, '翻卡完成鼓励语')
  eq('翻卡做完给出主鼓励语', await text('.flashcard-mode .encourage-main'), '恭喜你，完成一天任务，继续坚持！')
  ok('翻卡做完另有一句附加鼓励语', (await text('.flashcard-mode .encourage-extra')).length >= 2,
    await text('.flashcard-mode .encourage-extra'))

  await go('/')
  await waitFor(`!!document.querySelector('.home-page .finish-card')`, '首页完成卡片')
  eq('首页同样显示主鼓励语', await text('.home-page .finish-card .encourage-main'), '恭喜你，完成一天任务，继续坚持！')
  const extraOnHome = await text('.home-page .finish-card .encourage-extra')
  ok('首页附加鼓励语不为空', extraOnHome.length >= 2, extraOnHome)
  eq('首页今日任务 5/5', await text('.home-page .task-count'), '5/5')
}

// ================================================================ 15. 本轮 12 项需求逐条自测
section('15. 12 项需求逐条自测（表情 / 烟花 / 手写 / 发音 / 难度 / 音节 / 词表 / 测试卷 / 完形 / 音效 / 连对）')
{
  // ---------------------------------------------------------------- 本段专用小工具
  /** 读学生设置；键不存在返回 '__missing__'（eq 不接受 undefined） */
  const settingOf = key => evaluate(`
    (() => {
      const id = localStorage.getItem('word_review_current_student')
      const raw = localStorage.getItem('wr_' + id + '_settings')
      if (!raw) return '__missing__'
      let obj
      try { obj = JSON.parse(raw) } catch { return '__missing__' }
      const v = obj ? obj[${JSON.stringify(key)}] : undefined
      return v === undefined ? '__missing__' : v
    })()
  `)
  const setTaskSize = n => typeInto('.task-settings .el-input-number input', String(n))

  /** 把 Web Speech 换成录音桩，确认「点卡片真的念了这个词」 */
  const stubSpeech = () => evaluate(`
    (() => {
      try {
        window.__spoken = []
        const rec = u => { window.__spoken.push(String(u && u.text != null ? u.text : u)) }
        if (typeof window.SpeechSynthesisUtterance !== 'function') {
          window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t } }
        }
        if (window.speechSynthesis) {
          window.__origSpeak = window.speechSynthesis.speak
          Object.defineProperty(window.speechSynthesis, 'speak', {
            configurable: true, writable: true, value: rec
          })
        } else {
          Object.defineProperty(window, 'speechSynthesis', {
            configurable: true, writable: true,
            value: { speak: rec, cancel() {}, getVoices() { return [] } }
          })
        }
        window.speechSynthesis.speak('__probe__')
        const hits = window.__spoken.slice()
        window.__spoken = []
        return hits.length === 1 && hits[0] === '__probe__' ? true : '探针失败：' + JSON.stringify(hits)
      } catch (e) {
        return '注入失败：' + (e && e.message)
      }
    })()
  `)
  const restoreSpeech = () => evaluate(`
    (() => {
      try {
        if (window.__origSpeak && window.speechSynthesis) {
          Object.defineProperty(window.speechSynthesis, 'speak', {
            configurable: true, writable: true, value: window.__origSpeak
          })
        }
      } catch {}
      window.__spoken = []
      window.__origSpeak = null
      return true
    })()
  `)
  const spokenTexts = () => evaluate(`(window.__spoken || []).slice()`)

  const wrongIds = () => evaluate(`
    (() => {
      const id = localStorage.getItem('word_review_current_student')
      try {
        const v = JSON.parse(localStorage.getItem('wr_' + id + '_wrong') || '[]')
        return Array.isArray(v) ? v : []
      } catch { return [] }
    })()
  `)

  /** 当前今日任务的词条（含释义、音标），顺序与任务一致 */
  async function todayWords() {
    const task = await currentTask()
    const ids = (task && task.ids) || []
    if (!ids.length) return []
    return evaluate(`
      (() => {
        ${CURRENT_BOOK_JS}
        const words = JSON.parse(localStorage.getItem('word_review_local_words') || '[]')
        const pool = bookId ? words.filter(x => x.book_id === bookId) : words
        const byId = new Map(pool.map(w => [w.id, w]))
        return ${JSON.stringify(ids)}.map(id => {
          const w = byId.get(id)
          return w ? { id: w.id, word: w.word, mean: w.mean || '', phonetic: w.phonetic || '' } : null
        }).filter(Boolean)
      })()
    `)
  }

  /** 手写板上画两笔（PointerEvent 真派发，不是直接调组件方法） */
  const drawOnPad = () => evaluate(`
    (() => {
      const canvas = document.querySelector('.spelling-mode .pad-canvas')
      if (!canvas) return false
      const r = canvas.getBoundingClientRect()
      const fire = (type, dx, dy, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
        isPrimary: true, button: 0, buttons, clientX: r.left + dx, clientY: r.top + dy
      }))
      fire('pointerdown', 20, 40, 1)
      fire('pointermove', 50, 60, 1)
      fire('pointermove', 90, 90, 1)
      fire('pointerup', 90, 90, 0)
      return true
    })()
  `)

  const optionTexts = sel => evaluate(`
    (() => [...document.querySelectorAll(${JSON.stringify(sel)})]
      .map(e => (e.textContent || '').replace(/\\s+/g, ' ').trim()))()
  `)
  const clickNth = (sel, n) => evaluate(`
    (() => {
      const el = document.querySelectorAll(${JSON.stringify(sel)})[${n}]
      if (!el) return false
      el.click()
      return true
    })()
  `)
  /** 四个释义的词性是否完全一致（交集非空即算一致） */
  const samePos = means => {
    const sets = means.map(m => posKeys(m))
    if (!sets.length || sets.some(s => !s.size)) return false
    let common = new Set(sets[0])
    for (const s of sets.slice(1)) common = new Set([...common].filter(k => s.has(k)))
    return common.size > 0
  }
  const streakLabelNow = () => evaluate(
    `(document.querySelector('.streak-flash .streak-label')?.textContent || '')`
  )

  // ---------------------------------------------------------------- A 首启默认
  await navigate(`${BASE}/manifest.json`)
  await evaluate('localStorage.clear()')
  await navigate(`${BASE}/#/`)
  await waitFor(`!!document.querySelector('.home-page .task-count')`, '需求自测：首页')
  await sleep(400)
  await go('/study')
  await waitFor(`!!document.querySelector('.student-bar .el-tag')`, '需求自测：背诵页')
  eq('默认每天 40 词（今日任务条）', norm(await text('.student-bar .el-tag')), '今日任务 0/40 词')
  eq('每日任务量输入框默认 40', await evaluate(
    `document.querySelector('.task-settings .el-input-number input')?.value || ''`), '40')
  ok('音效开关默认打开', await evaluate(`!!document.querySelector('.sound-switch.is-checked')`))
  ok('背诵页带「今日单词表」「100 词测试卷」入口',
    (await exists('.entry-daily')) && (await exists('.entry-exam')))

  // ---------------------------------------------------------------- B 任务量可调（调小）
  await setTaskSize(6)
  await waitFor(`(document.querySelector('.student-bar .el-tag')?.textContent || '').includes('/6 词')`,
    '每日任务量改成 6 词')
  eq('任务量改小后落盘 dailySize=6', await settingOf('dailySize'), 6)
  await waitFor(`(document.querySelector('.flashcard-mode .progress-badge')?.textContent || '').includes('/6')`,
    '翻卡按 6 词重排')
  const task6 = await currentTask()
  eq('今日任务真的只有 6 个词', (task6?.ids || []).length, 6)

  // ---------------------------------------------------------------- C 点卡即发音
  ok('把语音合成换成录音桩', await stubSpeech() === true, String(await stubSpeech()))
  const cardWord = await text('.flashcard-mode .word-text')
  ok('翻卡正面是英文单词', /^[A-Za-z][A-Za-z' -]*$/.test(cardWord), cardWord)
  eq('还没点卡片时没有发音', await spokenTexts(), [])
  await click('.flashcard-wrapper')
  await waitFor(`!!document.querySelector('.flashcard.flipped')`, '点卡片翻面')
  eq('点一下卡片就念出这个词（不用单独点喇叭）', await spokenTexts(), [cardWord])
  ok('卡片提示写明「听发音」', (await text('.flashcard-mode .word-hint')).includes('听发音'),
    await text('.flashcard-mode .word-hint'))
  await click('.flashcard-wrapper')
  await sleep(250)
  eq('同一个词反复点只念一次（不叠音）', await spokenTexts(), [cardWord])
  await restoreSpeech()

  // ---------------------------------------------------------------- C2 翻卡背面不放中文
  {
    const hintRaw = await evaluate(
      `(document.querySelector('.flashcard-back .word-sentence.muted')?.textContent || '')`)
    const hint = norm(hintRaw)
    const backAll = norm(await text('.flashcard-mode .flashcard-back'))
    const meaningPart = hint ? backAll.split(hint).join('') : backAll
    ok('翻卡背面不出现中文释义', !/[\u4e00-\u9fa5]/.test(meaningPart), meaningPart || '（空）')
    const cardMean = norm(await meanOf(cardWord))
    ok('翻卡背面没有该词的中文释义', !cardMean || !meaningPart.includes(cardMean),
      `释义「${cardMean}」背面「${meaningPart}」`)
    ok('提示学生中文在「今日单词表」里', !hint || hint.includes('今日单词表'), hint || '（有例句，无提示）')
  }

  // ---------------------------------------------------------------- D 音效开关
  await click('.sound-switch')
  await waitFor(`!document.querySelector('.sound-switch').classList.contains('is-checked')`, '关掉音效')
  eq('关掉音效后写进设置 sound=false', await settingOf('sound'), false)
  await click('.sound-switch')
  await waitFor(`document.querySelector('.sound-switch').classList.contains('is-checked')`, '重新打开音效')
  eq('再打开音效后写进设置 sound=true', await settingOf('sound'), true)

  // ---------------------------------------------------------------- E 完成一天任务放烟花
  {
    let guard = 0
    while (!(await exists('.flashcard-mode .encouragement')) && guard++ < 20) {
      if (!(await exists('.rating-good'))) {
        await click('.flashcard-wrapper')
        await waitFor(`!!document.querySelector('.rating-good')`, '翻面')
      }
      await waitFor(`(() => { const b = document.querySelector('.rating-good'); return !!b && !b.disabled })()`,
        '评分按钮解锁', 6000)
      await click('.rating-good')
      await sleep(150)
    }
    ok('6 个词都评完（没有卡在某一词上）', guard < 20, String(guard))
    await waitFor(`!!document.querySelector('.flashcard-mode .encouragement .encourage-main')`, '完成一天任务')
    ok('完成一天任务放烟花（canvas 已挂载）', await exists('.flashcard-mode .fireworks-canvas'))
    const fw = await evaluate(`(() => {
      const c = document.querySelector('.flashcard-mode .fireworks-canvas')
      return c ? { w: c.width, h: c.height, pos: getComputedStyle(c).position } : null
    })()`)
    ok('烟花画布真的开出了像素尺寸', !!fw && fw.w > 0 && fw.h > 0, JSON.stringify(fw))
    eq('烟花层是全屏 fixed 覆盖', fw?.pos, 'fixed')
  }

  // ---------------------------------------------------------------- F 拼写改手写、且不给音标
  ok('切到拼写模式', await clickByText('.mode-selector .el-radio-button', '拼写'))
  await waitFor(`!!document.querySelector('.spelling-mode .pad-canvas')`, '手写板')
  ok('拼写提示改为「手写」', (await text('.spelling-mode .spelling-hint')).includes('手写'),
    await text('.spelling-mode .spelling-hint'))
  ok('手写板初始是空的（占位提示在）', await exists('.spelling-mode .pad-placeholder'))
  eq('拼写卡片里没有音标元素（需求 5）', await count('.spelling-mode .word-phonetic'), 0)
  await click('.pad-check')
  ok('空着手写板点「对答案」会被拦下',
    await waitForSoft(`[...document.querySelectorAll('.el-message')].some(m => (m.textContent || '').includes('先在框里'))`, 5000),
    await text('.el-message'))
  ok('被拦下时没有直接给出答案', !(await exists('.self-check .answer-word')))
  ok('在手写板上画两笔', await drawOnPad())
  ok('画完后占位提示消失', await waitForSoft(`!document.querySelector('.spelling-mode .pad-placeholder')`, 5000))
  await click('.pad-check')
  await waitFor(`!!document.querySelector('.self-check .answer-word')`, '自评答案')
  {
    const answerWord = norm(await text('.self-check .answer-word'))
    ok('自评答案给出英文单词', /^[A-Za-z][A-Za-z' -]*$/.test(answerWord), answerWord)
    const cardText = norm(await text('.spelling-mode .spelling-card'))
    const phoneticOf = (await todayWords()).find(w => w.word.toLowerCase() === answerWord.toLowerCase())?.phonetic || ''
    ok('拼写卡片上不显示音标', !phoneticOf || !cardText.includes(phoneticOf),
      `音标「${phoneticOf}」卡片「${cardText.slice(0, 80)}」`)
    ok('卡片里也没有 IPA 重音符', !cardText.includes('ˈ'), cardText.slice(0, 80))
    const before = (await wrongIds()).length
    await click('.self-btn.self-wrong')
    await waitFor(`!!document.querySelector('.spelling-result .result-wrong')`, '自评写错')
    ok('自评写错时给出正确答案', (await text('.spelling-result .result-wrong')).includes(answerWord),
      await text('.spelling-result .result-wrong'))
    ok('自评写错时提示本轮最后再出现一次',
      (await text('.spelling-result .retry-hint')).includes('再出现一次'),
      await text('.spelling-result .retry-hint'))
    ok('写错的词进了错题本', (await wrongIds()).length > before,
      `${before} → ${(await wrongIds()).length}`)
    ok('点「下一题」继续', await clickByText('.spelling-result button', '下一题'))
    ok('下一题手写板被清空', await waitForSoft(`!!document.querySelector('.spelling-mode .pad-placeholder')`, 6000))
    eq('下一题同样不显示音标', await count('.spelling-mode .word-phonetic'), 0)
  }

  // ---------------------------------------------------------------- G 音节背记（教怎么按音标切音节记）
  ok('切到音节模式', await clickByText('.mode-selector .el-radio-button', '音节'))
  await waitFor(`!!document.querySelector('.syllable-mode .syllable-word')`, '音节背记出题')
  {
    const syl = await evaluate(`
      (() => ({
        word: (document.querySelector('.syllable-word')?.textContent || '').trim(),
        phonetic: (document.querySelector('.syllable-phonetic')?.textContent || '').trim(),
        chips: [...document.querySelectorAll('.syllable-chip')].map(c =>
          (c.textContent || '').replace('重读', '').replace(/\\s+/g, ' ').trim()),
        stressed: !!document.querySelector('.syllable-chip.is-stressed'),
        listen: !!document.querySelector('.syllable-listen'),
        tip: (document.querySelector('.syllable-tip')?.textContent || '').replace(/\\s+/g, ' ').trim(),
        empty: !!document.querySelector('.syllable-empty')
      }))()
    `)
    ok('音节页讲清了怎么按音标切音节', syl.tip.includes('音节') && syl.tip.includes('重读'), syl.tip.slice(0, 60))
    ok('音节页能直接听发音', syl.listen)
    if (syl.phonetic) {
      eq(`音节切分与音标一致（${syl.word} ${syl.phonetic}）`,
        syl.chips, splitSyllables(syl.phonetic))
      eq('重读音节标记与音标一致', syl.stressed, stressedSyllable(syl.phonetic) >= 0)
    } else {
      ok('没有音标时给出提示而不是空着', syl.empty)
    }
    ok('点「下一个」能翻到下一个词', await clickByText('.syllable-nav button', '下一个'))
    await waitFor(`(document.querySelector('.syllable-progress')?.textContent || '').trim() === '2/6'`,
      '音节翻到第 2 个')
  }

  // ---------------------------------------------------------------- H 任务量调回 40
  await setTaskSize(40)
  await waitFor(`/\\/40 词/.test(document.querySelector('.student-bar .el-tag')?.textContent || '')`, '任务量调回 40')
  eq('任务量调回 40 后落盘 dailySize=40', await settingOf('dailySize'), 40)
  const task40 = await currentTask()
  eq('今日任务恢复 40 个词', (task40?.ids || []).length, 40)

  // ---------------------------------------------------------------- I 选择题加难 + 🤔 表情 + 连对档位
  ok('切到选择模式', await clickByText('.mode-selector .el-radio-button', '选择'))
  await waitFor(`!!document.querySelector('.quiz-word')`, '选择题出题')
  {
    let strict = 0
    for (let q = 1; q <= 8; q++) {
      const word = await text('.quiz-word')
      const opts = await optionTexts('.quiz-option .option-text')
      eq(`选择题第 ${q} 题四个选项`, opts.length, 4)
      eq(`选择题第 ${q} 题四个选项互不相同`, new Set(opts).size, 4)
      const mean = norm(await meanOf(word))
      if (!mean) { ok(`选择题第 ${q} 题查到释义`, false, word); break }
      if (samePos(opts)) strict++
      else console.log(`  INFO  第 ${q} 题选项词性没完全一致：${word} ${mean} → ${JSON.stringify(opts)}`)
      ok(`选择题第 ${q} 题点中正确释义`, await pickQuizOption(mean), mean)
      await waitFor(`(() => { const b = document.querySelector('.quiz-confirm'); return !!b && !b.disabled })()`,
        `选择题第 ${q} 题确认按钮解锁`)
      await click('.quiz-confirm')
      await waitFor(`!!document.querySelector('.quiz-feedback')`, `选择题第 ${q} 题反馈`)
      ok(`选择题第 ${q} 题答对`, !!(await exists('.quiz-feedback .feedback-correct')))
      ok(`选择题第 ${q} 题点「下一题」`, await clickByText('.quiz-feedback button', '下一题'))
      await waitFor(`!!document.querySelector('.quiz-actions .quiz-confirm')`, `选择题第 ${q} 题翻页`)
    }
    ok('抽查难度上来了：四个选项词性一致（8 题里至少 6 题）', strict >= 6, `一致 ${strict}/8`)
  }
  {
    // 答错 → 思考表情 + 连对清零
    const word = await text('.quiz-word')
    const opts = await optionTexts('.quiz-option .option-text')
    const mean = norm(await meanOf(word))
    const wrongIdx = opts.findIndex(t => coreMean(t) !== coreMean(mean))
    ok('能挑出一个明显不对的释义来答错', wrongIdx >= 0, JSON.stringify(opts))
    ok('点错选项', await clickNth('.quiz-option', wrongIdx < 0 ? (opts.length - 1) : wrongIdx))
    await waitFor(`(() => { const b = document.querySelector('.quiz-confirm'); return !!b && !b.disabled })()`,
      '答错题确认按钮解锁')
    await click('.quiz-confirm')
    await waitFor(`!!document.querySelector('.quiz-feedback .feedback-wrong')`, '答错反馈')
    const fb = await text('.quiz-feedback .feedback-wrong')
    ok('答错的表情换成思考 🤔', fb.includes('🤔'), fb)
    ok('答错时告诉学生正确答案', fb.includes(mean), `${fb} / ${mean}`)
    ok('答错时提示这个词最后还会再出现一次',
      (await text('.quiz-feedback .feedback-retry')).includes('再出现一次'),
      await text('.quiz-feedback .feedback-retry'))
    eq('答错后连对清零（头部不再显示连对）', await count('.quiz-streak'), 0)
    await waitForSoft(`!document.querySelector('.streak-flash .streak-label')`, 3000)
    eq('答错后清掉连对闪光', await count('.streak-flash .streak-label'), 0)
    const afterWrong = (await wrongIds()).length
    ok('答错的词进了错题本', afterWrong >= 1, String(afterWrong))
    ok('点「下一题」继续', await clickByText('.quiz-feedback button', '下一题'))

    // 连答对 9 题：3 题起依次 Good / Great / Brilliant / Wonderful / Fantastic / Excellent / Perfect
    const got = []
    for (let q = 1; q <= 9; q++) {
      await waitFor(`!!document.querySelector('.quiz-word')`, `连对第 ${q} 题出题`)
      const w = await text('.quiz-word')
      const m = norm(await meanOf(w))
      ok(`连对第 ${q} 题点中正确释义`, await pickQuizOption(m), `${w} → ${m}`)
      await waitFor(`(() => { const b = document.querySelector('.quiz-confirm'); return !!b && !b.disabled })()`,
        `连对第 ${q} 题确认按钮解锁`)
      await click('.quiz-confirm')
      await waitFor(`!!document.querySelector('.quiz-feedback .feedback-correct')`, `连对第 ${q} 题答对`)
      got.push(norm(await streakLabelNow()))
      if (q < 9) {
        await clickByText('.quiz-feedback button', '下一题')
      }
    }
    eq('连对 1、2 题不给称号', got.slice(0, 2), ['', ''])
    eq('连对 3 题起依次给档位称号（含 Perfect）',
      got.slice(2), STREAK_TIERS.map(t => t.label))
    ok('9 连对时头部显示「🔥 9 连对」', (await text('.quiz-streak')).includes('9 连对'),
      await text('.quiz-streak'))
    await clickByText('.quiz-feedback button', '下一题')
  }

  // ---------------------------------------------------------------- J 完形填空（随机四词，易混淆）
  ok('切到完形模式', await clickByText('.mode-selector .el-radio-button', '完形'))
  await waitFor(`!!document.querySelector('.cloze-mode .cloze-sentence')`, '完形出题')
  {
    const means = await evaluate(`
      (() => {
        ${CURRENT_BOOK_JS}
        const words = JSON.parse(localStorage.getItem('word_review_local_words') || '[]')
        const pool = bookId ? words.filter(x => x.book_id === bookId) : words
        const map = {}
        for (const w of pool) map[String(w.word).toLowerCase()] = w.mean || ''
        return map
      })()
    `)
    let consistent = 0
    for (let q = 1; q <= 3; q++) {
      await waitFor(`document.querySelectorAll('.cloze-option').length === 4`, `完形第 ${q} 题四个选项`)
      const prog = norm(await text('.cloze-progress'))
      if (q === 1) {
        const [done, total] = prog.split('/').map(Number)
        eq('完形从第 0 题开始计数', done, 0)
        ok('完形题量不超过 12', total >= 1 && total <= 12, prog)
        ok('完形题面留了空格', (await text('.cloze-sentence')).includes('______'),
          await text('.cloze-sentence'))
        ok('完形说明四个选项词性相同、意思相近',
          (await text('.cloze-hint')).includes('词性相同'), await text('.cloze-hint'))
      }
      const words = await optionTexts('.cloze-option .option-word')
      eq(`完形第 ${q} 题四个选项`, words.length, 4)
      eq(`完形第 ${q} 题四个选项互不相同`, new Set(words).size, 4)
      const opts = words.map(w => means[String(w).toLowerCase()] || '')
      if (opts.every(Boolean) && samePos(opts)) consistent++
      else console.log(`  INFO  完形第 ${q} 题选项词性没完全一致：${JSON.stringify(words)}`)
      const cloze = await answerCloze()
      ok(`完形第 ${q} 题点到了正确选项`, cloze.clicked, JSON.stringify(cloze))
      await waitFor(`!!document.querySelector('.cloze-feedback .feedback-correct')`, `完形第 ${q} 题答对`)
      const shown = await text('.cloze-feedback .cloze-mean')
      ok(`完形第 ${q} 题给出单词和中文释义`,
        shown.toLowerCase().includes(cloze.word.toLowerCase()) && /[\u4e00-\u9fa5]/.test(shown), shown)
      if (q < 3) {
        ok(`完形第 ${q} 题点「下一题」`, await clickByText('.cloze-feedback button', '下一题'))
        await waitFor(`(document.querySelector('.cloze-progress')?.textContent || '').trim() === '${q}/' + (document.querySelector('.cloze-progress')?.textContent || '').trim().split('/')[1]`,
          `完形进度走到第 ${q} 题`, 8000).catch(() => false)
      }
    }
    ok('完形的四个选项词性一致（3 题里至少 2 题）', consistent >= 2, `一致 ${consistent}/3`)
  }

  // ---------------------------------------------------------------- K 今日单词表（每天的词单独一页，带中文）
  {
    const table = await readDailyTable()
    ok('单词表标题写明共 40 词', table.sub.includes('共 40 词'), table.sub)
    eq('单词表 40 行', table.rows.length, 40)
    ok('每行都有中文释义', table.rows.every(r => /[\u4e00-\u9fa5]/.test(r[4] || '')),
      JSON.stringify(table.rows.find(r => !/[\u4e00-\u9fa5]/.test(r[4] || '')) || ''))
    eq('每行都有发音按钮', await count('.daily-words-page .cell-speak'), 40)
    const expected = await todayWords()
    eq('单词表就是今天任务那批词（顺序也一致）', table.words, expected.map(w => w.word))
    const phonetics = new Map(expected.map(w => [w.word, w.phonetic || '']))
    let multi = 0
    let bad = ''
    for (const row of table.rows) {
      const syl = splitSyllables(phonetics.get(row[1]) || '')
      if (syl.length > 1) {
        multi++
        if (row[3] !== syl.join('·')) bad = `${row[1]} 期望 ${syl.join('·')} 实际 ${row[3]}`
      } else if (row[3] !== '—') {
        bad = `${row[1]} 单音节应为 —，实际 ${row[3]}`
      }
      if (bad) break
    }
    ok('音节列按音标切好（多音节词带「·」）', bad === '' && multi >= 1, bad || `多音节 ${multi} 个`)
  }

  // ---------------------------------------------------------------- L 100 词测试卷：打乱顺序、一题 1 分、0 分档 Come on + 烟花
  {
    await go('/exam')
    await waitFor(`!!document.querySelector('.exam-intro')`, '测试卷开始页')
    await click('.exam-start')
    await waitFor(`!!document.querySelector('.exam-word')`, '测试卷第 1 题')
    eq('测试卷共 100 题', await text('.exam-progress'), '第 1 / 100 题')

    // 每题都挑一个「绝不可能是该词释义」的选项，保证 0 分，检验评级与错词卷
    const run = await evaluate(`
      (async () => {
        ${CURRENT_BOOK_JS}
        const words = JSON.parse(localStorage.getItem('word_review_local_words') || '[]')
        const pool = bookId ? words.filter(x => x.book_id === bookId) : words
        const byWord = new Map()
        for (const w of pool) {
          const key = String(w.word || '').toLowerCase()
          if (!byWord.has(key)) byWord.set(key, [])
          byWord.get(key).push(String(w.mean || ''))
        }
        const N = t => String(t || '').replace(/\\s+/g, ' ').trim()
        const tick = () => new Promise(r => setTimeout(r, 20))
        const total = 100
        for (let q = 0; q < total; q++) {
          const word = N(document.querySelector('.exam-word')?.textContent)
          const cands = (byWord.get(String(word).toLowerCase()) || []).map(N).filter(Boolean)
          const opts = [...document.querySelectorAll('.exam-option')]
          if (!cands.length || opts.length !== 4) {
            return { ok: false, at: q + 1, word, cands, optCount: opts.length }
          }
          const texts = opts.map(o => N(o.querySelector('.option-text')?.textContent))
          const idx = texts.findIndex(t => !cands.includes(t))
          if (idx < 0) return { ok: false, at: q + 1, word, reason: '四个选项都是正确释义', texts }
          opts[idx].click()
          await tick()
          if (!opts[idx].classList.contains('is-picked')) {
            return { ok: false, at: q + 1, word, reason: '点了选项却没选中', texts }
          }
          const buttons = [...document.querySelectorAll('.exam-actions button')]
          const btn = buttons.find(b => (b.textContent || '').includes('下一题')) ||
                      buttons.find(b => (b.textContent || '').includes('交卷'))
          if (!btn) return { ok: false, at: q + 1, word, reason: '没有下一题/交卷按钮' }
          btn.click()
          await tick()
          if (q < total - 1) {
            const prog = N(document.querySelector('.exam-progress')?.textContent)
            const want = '第 ' + (q + 2) + ' / ' + total + ' 题'
            if (prog !== want) return { ok: false, at: q + 1, word, reason: '进度没往前走：' + prog }
          }
        }
        return { ok: true }
      })()
    `)
    ok('100 题全部作答完并交卷', run?.ok, JSON.stringify(run))
    await waitFor(`!!document.querySelector('.exam-result')`, '测试卷出成绩')
    eq('一题 1 分：全错 0 分', norm(await text('.exam-result .result-score')), '0 / 100')
    eq('90 分以下评级 Come on', await text('.exam-result .result-grade'), 'Come on')
    ok('评级给出鼓励语', (await text('.exam-result .result-tip')).length >= 4,
      await text('.exam-result .result-tip'))
    ok('错词卷列出 100 个词', (await text('.exam-result .wrong-title')).includes('100'),
      await text('.exam-result .wrong-title'))
    eq('错词卷 100 行', await count('.exam-result .el-table__body tr'), 100)
    ok('交卷后放烟花', await exists('.exam-result .fireworks-canvas'))
    ok('成绩页可以再测一次', await exists('.exam-again'))
  }
}

// ================================================================ 16. 控制台
section('16. 运行期控制台')
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
