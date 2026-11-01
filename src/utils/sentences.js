import defaultWords from './defaultWords.json'

/**
 * 例句速查表：docx 词表只有单词/音标/释义，没有例句。
 * 这里用内置 688 词表按单词补齐，命中的词就能在翻卡/完形/今日单词表里看到例句。
 */
const SENTENCE_MAP = new Map(
  defaultWords
    .filter(w => w.sentence && String(w.sentence).trim().length > 8)
    .map(w => [String(w.word).toLowerCase(), w.sentence])
)

export function sentenceFor(word) {
  return SENTENCE_MAP.get(String(word || '').toLowerCase()) || ''
}

export function hasSentence(word) {
  return SENTENCE_MAP.has(String(word || '').toLowerCase())
}
