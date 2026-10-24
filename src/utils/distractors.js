const POS_TAGS = '(n|vt|vi|v|adj|adv|prep|conj|pron|num|art|int|aux)'
const POS_RE = new RegExp(`(^|[^a-z])${POS_TAGS}\\.`, 'gi')
const SEGMENT_RE = /[；;，,、/]/

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

/** 释义的主干（去掉词性标签与标点，只留第一段），用来判断两个释义是不是太像 */
export function coreMean(mean = '') {
  const text = String(mean)
    .replace(new RegExp(`(^|[^a-z])${POS_TAGS}\\.`, 'gi'), ' ')
    .split(SEGMENT_RE)[0] || ''
  return text.replace(/[\s.。:：()（）[\]【】"“”'‘’]/g, '').toLowerCase()
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

function scoreOf(candidate, correct, correctCore, correctPos, recent) {
  const pos = parsePos(candidate.mean)
  const core = coreMean(candidate.mean)
  let score = 0
  // 同词性更容易混淆，优先当干扰项
  if (correctPos.length && pos.some(p => correctPos.includes(p))) score += 3
  // 释义长短接近的，读起来更像同一个词
  score += Math.max(0, 2 - Math.abs(core.length - correctCore.length) * 0.15)
  // 刚在上一题出现过的释义尽量避开
  if (recent.has(core)) score -= 4
  return score
}

/**
 * 挑干扰项：优先同词性、释义长度接近、最近没出现过的，且不会和正确释义互相包含。
 * pool 传整个词库，选项就不会只围着当天任务打转。
 */
export function pickDistractors(correct, pool, { count = 3, recent = [] } = {}) {
  if (!correct) return []
  const correctCore = coreMean(correct.mean)
  const correctPos = parsePos(correct.mean)
  const recentSet = new Set(recent)
  const correctWord = String(correct.word || '').toLowerCase()
  const chosen = []
  const usedCores = new Set([correctCore])
  const usedWords = new Set([correctWord])

  const base = (pool || []).filter(w => {
    if (!w || w.id === correct.id) return false
    const word = String(w.word || '').toLowerCase()
    if (!word || usedWords.has(word)) return false
    const core = coreMean(w.mean)
    if (!core || usedCores.has(core)) return false
    return !tooClose(core, correctCore)
  })

  const take = (list) => {
    for (const w of list) {
      if (chosen.length >= count) return
      const core = coreMean(w.mean)
      const word = String(w.word || '').toLowerCase()
      if (usedCores.has(core) || usedWords.has(word)) continue
      usedCores.add(core)
      usedWords.add(word)
      chosen.push(w)
    }
  }

  const ranked = shuffled(base)
    .map(w => ({ w, score: scoreOf(w, correct, correctCore, correctPos, recentSet) }))
    .sort((a, b) => b.score - a.score)
  take(ranked.map(x => x.w))

  // 同词性的词不够时，放宽词性但仍不与已选项重复
  if (chosen.length < count) {
    take(shuffled(base).filter(w => {
      const core = coreMean(w.mean)
      return !usedCores.has(core) && !tooClose(core, correctCore)
    }))
  }
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
