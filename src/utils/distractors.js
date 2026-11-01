const POS_TAGS = '(n|vt|vi|v|adj|adv|prep|conj|pron|num|art|int|aux|abbr|a)'
const POS_RE = new RegExp(`(^|[^a-z])${POS_TAGS}\\.`, 'gi')
const SEGMENT_RE = /[；;，,、/]/
// vt/vi 都算动词，a. 在本词库里就是形容词（解析 docx 时已统一成 adj.）
const POS_ALIAS = { vt: 'v', vi: 'v', a: 'adj', abbr: 'abbr' }

/** 释义里的词性标签，如 "n. 价值 v. 估价" → ['n', 'v'] */
export function parsePos(mean = '') {
  const set = new Set()
  POS_RE.lastIndex = 0
  let m = POS_RE.exec(mean)
  while (m) {
    set.add(m[2].toLowerCase())
    m = POS_RE.exec(mean)
  }
  return [...set]
}

/** 归一后的词性集合：选项要和正确答案词性一致，就靠它比 */
export function posKeys(mean = '') {
  return new Set(parsePos(mean).map(p => POS_ALIAS[p] || p))
}

/** 释义的主干（去掉词性标签与标点，只留第一段），用来判断两个释义是不是太像 */
export function coreMean(mean = '') {
  const text = String(mean)
    .replace(new RegExp(`(^|[^a-z])${POS_TAGS}\\.`, 'gi'), ' ')
    .split(SEGMENT_RE)[0] || ''
  return text.replace(/[\s.。:：()（）[\]【】"“”'‘’]/g, '').toLowerCase()
}

/** 全部释义（不只第一段），用于「意义相近」的比对 */
function allMean(mean = '') {
  return String(mean)
    .replace(new RegExp(`(^|[^a-z])${POS_TAGS}\\.`, 'gi'), ' ')
    .replace(/[\s.。:：()（）[\]【】"“”'‘’]/g, '')
    .toLowerCase()
}

/** 两个释义共用的汉字个数（单个汉字太容易撞，不计分） */
function sharedHan(a, b) {
  if (!a || !b) return 0
  const set = new Set(b)
  let n = 0
  for (const ch of new Set(a)) if (set.has(ch)) n++
  return n >= 2 ? n : 0
}

function commonPrefix(a, b) {
  const len = Math.min(a.length, b.length)
  let i = 0
  while (i < len && a[i] === b[i]) i++
  return i
}

/** 限长度的编辑距离：超过 max 直接返回 max + 1 */
function editDistance(a, b, max = 4) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev = new Array(b.length + 1)
  const cur = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    let best = cur[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < best) best = cur[j]
    }
    if (best > max) return max + 1
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]
  }
  return prev[b.length]
}

function tooClose(a, b) {
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

/** 打乱一份索引，用于同分候选的随机化 */
function shuffled(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * 干扰项打分：越容易和正确答案搞混分越高。
 * 维度：释义里的共用汉字（意义相近）、拼写相近（形近词）、音标相近、释义长度接近。
 */
function scoreOf(candidate, correct, ctx) {
  const word = String(candidate.word || '').toLowerCase()
  const target = ctx.word
  let score = 0

  score += sharedHan(allMean(candidate.mean), ctx.allMean) * 0.9
  score += commonPrefix(word, target) * 0.9
  const dist = editDistance(word, target)
  if (dist <= 2) score += 3
  else if (dist <= 3) score += 1.2
  if (ctx.phonetic && candidate.phonetic) {
    const a = String(candidate.phonetic).toLowerCase()
    if (commonPrefix(a, ctx.phonetic) >= 3) score += 1.5
    if (Math.abs(a.length - ctx.phonetic.length) <= 1) score += 0.5
  }
  score += Math.max(0, 1.5 - Math.abs(word.length - target.length) * 0.2)
  if (ctx.recent.has(coreMean(candidate.mean))) score -= 4
  return score
}

/**
 * 挑干扰项：先严格按正确答案的词性过滤（四个选项词性一致），
 * 再按「意义相近 / 拼写形近 / 音近 / 长度接近」打分，取最像的前几个。
 * pool 传整个词库，选项就不会只围着当天任务打转。
 */
export function pickDistractors(correct, pool, { count = 3, recent = [] } = {}) {
  if (!correct) return []
  const correctCore = coreMean(correct.mean)
  const correctKeys = posKeys(correct.mean)
  const ctx = {
    word: String(correct.word || '').toLowerCase(),
    allMean: allMean(correct.mean),
    phonetic: String(correct.phonetic || '').toLowerCase(),
    recent: new Set(recent.map(x => coreMean(x)))
  }
  const chosen = []
  const usedCores = new Set([correctCore])
  const usedWords = new Set([ctx.word])

  const base = (pool || []).filter(w => {
    if (!w || w.id === correct.id) return false
    const word = String(w.word || '').toLowerCase()
    if (!word || usedWords.has(word)) return false
    const core = coreMean(w.mean)
    if (!core || usedCores.has(core)) return false
    return !tooClose(core, correctCore)
  })

  const samePos = correctKeys.size
    ? base.filter(w => [...posKeys(w.mean)].some(p => correctKeys.has(p)))
    : base

  const take = list => {
    for (const w of list) {
      if (chosen.length >= count) return
      const core = coreMean(w.mean)
      const word = String(w.word || '').toLowerCase()
      if (usedCores.has(core) || usedWords.has(word)) continue
      // 选项之间也不能太像，否则会出现两个都对的答案
      if (chosen.some(c => tooClose(coreMean(c.mean), core))) continue
      usedCores.add(core)
      usedWords.add(word)
      chosen.push(w)
    }
  }

  const rank = list => shuffled(list)
    .map(w => ({ w, score: scoreOf(w, correct, ctx) }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.w)

  take(rank(samePos))

  // 同词性不够时放宽词性（词库太小或生僻词性才会走到这里）
  if (chosen.length < count) take(rank(base))

  // 最后兜底：允许释义接近，只保证选项不重复
  if (chosen.length < count) {
    take(shuffled(pool || []).filter(w => {
      if (!w || w.id === correct.id) return false
      const word = String(w.word || '').toLowerCase()
      return !!word && !usedWords.has(word) && !!coreMean(w.mean)
    }))
  }
  return chosen.slice(0, count)
}

/** 正确项 + 干扰项，按固定顺序返回（正确项位置由调用方打乱） */
export function buildOptionList(correct, pool, opts) {
  return [correct, ...pickDistractors(correct, pool, opts)]
}
