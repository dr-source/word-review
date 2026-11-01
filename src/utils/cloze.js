function escapeReg(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把句子里的目标词挖成空格；句子不含这个词（含变形）时返回空串。
 * 先按整词匹配，再退化成词干前缀匹配（study → studied、make → making）。
 */
export function maskSentence(sentence, word) {
  const text = String(sentence || '')
  const target = String(word || '')
  if (!text || target.length < 2) return ''

  const exactRe = () => new RegExp(`\\b${escapeReg(target)}\\b`, 'gi')
  if (exactRe().test(text)) return text.replace(exactRe(), '______')

  const stem = target.replace(/[ey]$/i, '')
  if (stem.length >= 3) {
    const looseRe = () => new RegExp(`\\b${escapeReg(stem)}\\w*`, 'gi')
    if (looseRe().test(text)) return text.replace(looseRe(), '______')
  }
  return ''
}
