// 从「2025秋初中英语必背的2000个单词（新课标中考）」docx 里抽出词条，
// 生成 src/utils/middleSchoolWords.json（词表结构同 defaultWords.json）。
// 用法：node scripts/parse-docx-vocab.mjs [docx路径] [输出路径]
// 不依赖第三方库：自己读 zip 中央目录 + zlib 解压 word/document.xml。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SRC = process.argv[2] || 'C:/Users/dr515/Desktop/2025秋初中英语必背的2000个单词（新课标中考.docx'
const OUT = process.argv[3] || path.join(ROOT, 'src/utils/middleSchoolWords.json')
const DEBUG = process.env.DEBUG_PARSE === '1'

// ---------------------------------------------------------------- zip

/** 从 zip 缓冲里取出某个条目的原始内容（仅支持 store / deflate） */
function readZipEntry(buf, target) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('不是有效的 docx/zip：找不到中央目录结尾')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 中央目录损坏')
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    if (name === target) {
      const lNameLen = buf.readUInt16LE(localOffset + 26)
      const lExtraLen = buf.readUInt16LE(localOffset + 28)
      const start = localOffset + 30 + lNameLen + lExtraLen
      const data = buf.subarray(start, start + compSize)
      return method === 0 ? data : zlib.inflateRawSync(data)
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`zip 里没有 ${target}`)
}

// ---------------------------------------------------------------- xml

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decodeXml(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(lt|gt|amp|quot|apos);/g, (_, name) => ENTITIES[name])
}

/** document.xml → 段落文本数组（每个 <w:p> 里的 <w:t> 拼起来） */
function paragraphsOf(xml) {
  const out = []
  for (const chunk of xml.split('</w:p>')) {
    const texts = []
    for (const m of chunk.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) texts.push(decodeXml(m[1]))
    const line = texts.join('').replace(/\s+/g, ' ').trim()
    if (line) out.push(line)
  }
  return out
}

// ---------------------------------------------------------------- 词条

// 长词性放前面，避免 a. 抢走 adj./adv.；这批数据里 a. 就是形容词
const POS_TAGS = ['adj', 'adv', 'abbr', 'aux', 'conj', 'pron', 'prep', 'num', 'art', 'int', 'vt', 'vi', 'n', 'v', 'a']
// 词性标记用后行断言定位，不吞掉释义里的前一个汉字（否则 "无词义prep." 会带出「义」）
const POS_RE = new RegExp(`(?<![a-zA-Z])(${POS_TAGS.join('|')})\\.`, 'g')
// 词条编号标记：1. / 12． 后面紧跟英文（docx 里有的段落把两条词条挤在一起）
const MARK_RE = /\d{1,4}[.．](?=[a-zA-Z(\[])/g
const HEADER_RE = /中考英语词汇|必考！/
const WORD_OK_RE = /^[a-zA-Z][a-zA-Z'’\- ]*$/
// 音标里出现的字符（IPA 区、重音符、长音符等），词头和音标黏在一起时要靠它切开
const IPA_RE = /[\u0250-\u02FF\u02B0-\u02FFˈˌː\u02C8\u02CC]/
const IPA_STRIP_RE = /[\u0250-\u02FF\u02B0-\u02FFˈˌː\u02C8\u02CC]/g
const BOUNDARY_RE = /[\u0250-\u02FF\u02B0-\u02FFˈˌː\u02C8\u02CC]/

/** 把 a. 统一成 adj.（只改独立出现的词性标记，不动释义正文） */
function normalizePos(text) {
  return text.replace(/(^|[^a-zA-Z])a\./g, '$1adj.')
}

function firstPosIndex(text) {
  POS_RE.lastIndex = 0
  const m = POS_RE.exec(text)
  return m ? m.index : -1
}

/**
 * 把「词头 + 音标」这段文本切成 [音标数组, 词头数组]。
 * docx 里的写法很脏：音标可能缺左括号（awful ɔfʊl]）、
 * 词头和音标黏在一起（botherbɔðə(r)]）、括号里塞说明（according (to)）。
 */
function splitHead(zone) {
  const phonetics = []
  const pushPhonetic = raw => {
    for (const part of String(raw).split(/[；;]/)) {
      const t = part.replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim()
      if (t) phonetics.push(t)
    }
  }

  for (const m of zone.matchAll(/\[([^\]]*)\]/g)) pushPhonetic(m[1])

  let rest = zone.replace(/\[[^\]]*\]/g, ' ')

  // 缺左括号的音标：从第一个 IPA 字符（或紧跟其后的那个辅音字母）处断开
  if (BOUNDARY_RE.test(rest)) {
    let cut = -1
    for (let i = 1; i < rest.length; i++) {
      const ch = rest[i]
      if (BOUNDARY_RE.test(ch) || (/[a-zA-Z]/.test(ch) && BOUNDARY_RE.test(rest[i + 1]))) {
        cut = i
        break
      }
    }
    if (cut > 0) {
      pushPhonetic(rest.slice(cut))
      rest = rest.slice(0, cut)
    }
  }

  const heads = rest
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[（][^）]*[）]/g, ' ')
    // 括号没闭合（右括号被词性标记的边界吃掉了）：从残留的左括号一路砍掉
    .replace(/[(（][^()（）]*$/, ' ')
    .replace(/[=＝]/g, '/')
    .split(/[；;，,、/]/)
    .map(s => s
      .replace(IPA_STRIP_RE, ' ')
      // 只留纯英文的词头，后面粘上的中文说明/残留括号一律砍掉
      .replace(/[^a-zA-Z'’\-\s].*$/, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)

  return { phonetics: [...new Set(phonetics)], heads }
}

/**
 * 解析一条词条正文，如
 *   "able ['eɪbl] a.能够…的；有能力的"
 *   "a [ə；eɪ]；an [æn] art.(非特指的)一(个)"
 *   "chest n.箱子；盒子；胸部"
 * 返回 [{ word, phonetic, mean, sentence: '' }]，解析不出来返回 []
 */
function parseEntry(body) {
  const text = body.replace(/\s+/g, ' ').trim()
  const posAt = firstPosIndex(text)
  if (posAt < 0) return []
  const mean = normalizePos(text.slice(posAt).trim())
  if (!mean) return []

  const { phonetics, heads } = splitHead(text.slice(0, posAt))
  const phonetic = phonetics.join(' / ')

  return heads
    .filter(h => WORD_OK_RE.test(h) && h.length <= 24)
    .map(word => ({ word, phonetic, mean, sentence: '' }))
}

/** 词条之间按小写词去重，释义/音标取并集，别丢掉第二种写法 */
function mergeEntries(list) {
  const byWord = new Map()
  for (const item of list) {
    const key = item.word.toLowerCase()
    const hit = byWord.get(key)
    if (!hit) { byWord.set(key, { ...item }); continue }
    if (item.mean && !hit.mean.includes(item.mean.split(/[；;]/)[0])) {
      hit.mean = `${hit.mean}；${item.mean}`
    }
    if (item.phonetic && !hit.phonetic.split(' / ').includes(item.phonetic)) {
      hit.phonetic = hit.phonetic ? `${hit.phonetic} / ${item.phonetic}` : item.phonetic
    }
  }
  return [...byWord.values()]
}

// ---------------------------------------------------------------- main

function main() {
  if (!fs.existsSync(SRC)) throw new Error(`找不到源文件：${SRC}`)
  const xml = readZipEntry(fs.readFileSync(SRC), 'word/document.xml').toString('utf8')
  const paragraphs = paragraphsOf(xml)

  // 先把段落切成一条条词条正文。docx 是两栏排版转来的，一段里常常挤着两三条，
  // 编号标记（12. / 12．）前面的文字是上一条的续行。
  const records = []
  const skipped = []
  const appendTail = line => {
    const tail = line.replace(/\s+/g, ' ').trim()
    if (!tail) return
    if (records.length && tail.length <= 40) records[records.length - 1] += ` ${tail}`
    else skipped.push(tail)
  }

  for (const line of paragraphs) {
    if (HEADER_RE.test(line) || /^[A-Z]$/.test(line)) continue
    const marks = [...line.matchAll(MARK_RE)]
    if (!marks.length) { appendTail(line); continue }
    if (marks[0].index > 0) appendTail(line.slice(0, marks[0].index))
    marks.forEach((m, i) => {
      const start = m.index + m[0].length
      const end = i + 1 < marks.length ? marks[i + 1].index : line.length
      const body = line.slice(start, end).trim()
      if (body) records.push(body)
    })
  }

  const entries = []
  for (const body of records) {
    const parsed = parseEntry(body)
    if (parsed.length) entries.push(...parsed)
    else skipped.push(body)
  }

  if (DEBUG) {
    console.log(`段落 ${paragraphs.length} 条，切出词条 ${records.length} 条，未识别 ${skipped.length} 条：`)
    skipped.slice(0, 60).forEach(s => console.log('  ·', s.slice(0, 80)))
  }

  const words = mergeEntries(entries).map(w => ({
    word: w.word,
    phonetic: w.phonetic,
    mean: w.mean,
    sentence: ''
  }))

  fs.writeFileSync(OUT, `${JSON.stringify(words, null, 2)}\n`, 'utf8')
  console.log(`已写出 ${OUT}`)
  console.log(`词条 ${words.length} 个；无音标 ${words.filter(w => !w.phonetic).length} 个；多词头合并 ${entries.length - words.length} 组`)
}

main()
