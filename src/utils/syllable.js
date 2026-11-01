/**
 * 按音标切分音节（教学用）。
 * 规则：先找元音核，再按「最大音节首（maximal onset）」把两个元音之间的辅音分给前后音节。
 * 只处理常见中英音标字符，识别不了的音标原样返回，不抛错。
 */

// 双元音 / 长元音要排在单元音前面，先长后短
const VOWELS = [
  'eɪ', 'aɪ', 'ɔɪ', 'əʊ', 'oʊ', 'aʊ', 'ɪə', 'eə', 'ʊə',
  'iː', 'ɑː', 'ɔː', 'uː', 'ɜː', 'uː',
  'æ', 'e', 'ɪ', 'i', 'ɒ', 'ɔ', 'ʊ', 'u', 'ʌ', 'ə', 'ɑ', 'ɜ', 'ɐ', 'ɛ', 'ɘ', 'ɵ'
]

const STRESS = ['ˈ', 'ˌ', "'"]

// 可以整体做音节首的辅音组合（pl-、str- 这类）
const ONSETS = new Set([
  'pl', 'pr', 'bl', 'br', 'tr', 'dr', 'kl', 'kr', 'gl', 'gr',
  'fl', 'fr', 'sl', 'sp', 'st', 'sk', 'sm', 'sn', 'sw', 'tw', 'kw',
  'θr', 'ʃr', 'tʃ', 'dʒ', 'spr', 'str', 'skr', 'spl', 'skw', 'spj', 'stj', 'kju'
])

const CONSONANT_UNITS = ['tʃ', 'dʒ']

function tokenize(ipa) {
  const text = String(ipa || '').replace(/[/[\]\s.,;:·\-–—()]/g, '')
  const tokens = []
  let i = 0
  while (i < text.length) {
    const stress = STRESS.find(s => text.startsWith(s, i))
    if (stress) { tokens.push({ type: 'stress', text: stress }); i += stress.length; continue }

    const vowel = VOWELS.find(v => text.startsWith(v, i))
    if (vowel) {
      tokens.push({ type: 'vowel', text: vowel })
      i += vowel.length
      // 紧跟的长音符号并到元音里
      if (text[i] === 'ː') { tokens[tokens.length - 1].text += 'ː'; i += 1 }
      continue
    }

    const cons = CONSONANT_UNITS.find(c => text.startsWith(c, i))
    if (cons) { tokens.push({ type: 'cons', text: cons }); i += cons.length; continue }

    tokens.push({ type: 'cons', text: text[i] })
    i += 1
  }
  return tokens
}

/** 两个元音之间的辅音怎么分：返回分给下一个音节的辅音个数 */
function onsetLength(cluster) {
  if (cluster.length <= 1) return cluster.length
  const joined = cluster.join('')
  if (ONSETS.has(joined)) return cluster.length
  for (const size of [3, 2]) {
    if (cluster.length > size && ONSETS.has(cluster.slice(-size).join(''))) return size
  }
  return 1
}

/** 把音标切成音节数组，例如 əˈkɒmplɪʃ → ['ə', 'ˈkɒm', 'plɪʃ'] */
export function splitSyllables(phonetic) {
  const raw = String(phonetic || '').trim()
  if (!raw) return []
  const tokens = tokenize(raw)
  const nuclei = tokens.reduce((acc, t, i) => { if (t.type === 'vowel') acc.push(i); return acc }, [])
  if (!nuclei.length) return [raw]

  const bounds = [0]
  for (let k = 0; k < nuclei.length - 1; k++) {
    const from = nuclei[k] + 1
    const to = nuclei[k + 1]
    const between = tokens.slice(from, to)
    const cluster = between.filter(t => t.type === 'cons').map(t => t.text)
    const take = onsetLength(cluster)
    let boundary = to - take
    // 重音符跟着它后面的音节走
    while (boundary > from && tokens[boundary - 1].type === 'stress') boundary -= 1
    bounds.push(boundary)
  }
  bounds.push(tokens.length)

  const parts = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const part = tokens.slice(bounds[i], bounds[i + 1]).map(t => t.text).join('')
    if (part) parts.push(part)
  }
  return parts.length ? parts : [raw]
}

/** 用「·」把音标拼成便于朗读的音节串 */
export function syllableLine(phonetic, sep = '·') {
  return splitSyllables(phonetic).join(sep)
}

/** 带重音的音节下标（没有重音符时返回 -1） */
export function stressedSyllable(phonetic) {
  return splitSyllables(phonetic).findIndex(s => STRESS.some(x => s.includes(x)))
}
