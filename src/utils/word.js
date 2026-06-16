import { Storage, DB_KEYS, EBBINGHAUS } from './storage'

// 初始化默认数据
export function initDefaultData() {
  if (!Storage.get(DB_KEYS.BOOK_LIST)) {
    Storage.set(DB_KEYS.BOOK_LIST, [{ id: 'book1', name: '默认英语教材', createTime: Date.now() }])
  }
  if (!Storage.get(DB_KEYS.WORD_DATA)) {
    Storage.set(DB_KEYS.WORD_DATA, [])
  }
  if (!Storage.get(DB_KEYS.LEARN_RECORD)) Storage.set(DB_KEYS.LEARN_RECORD, {})
  if (!Storage.get(DB_KEYS.WRONG_WORDS)) Storage.set(DB_KEYS.WRONG_WORDS, [])

  // 首次使用——添加示例单词
  const words = Storage.get(DB_KEYS.WORD_DATA) || []
  if (words.length === 0) {
    const sampleWords = [
      { word: 'abandon', phonetic: '/əˈbændən/', mean: 'v. 放弃；遗弃', sentence: 'He abandoned his plan to travel abroad.' },
      { word: 'brilliant', phonetic: '/ˈbrɪliənt/', mean: 'adj. 辉煌的；杰出的', sentence: 'She had a brilliant idea.' },
      { word: 'challenge', phonetic: '/ˈtʃælɪndʒ/', mean: 'n. 挑战；v. 向…挑战', sentence: 'This task is a real challenge.' },
      { word: 'dedicate', phonetic: '/ˈdedɪkeɪt/', mean: 'v. 致力于；献身', sentence: 'She dedicated herself to science.' },
      { word: 'essential', phonetic: '/ɪˈsenʃl/', mean: 'adj. 基本的；必要的', sentence: 'Water is essential for life.' },
      { word: 'flexible', phonetic: '/ˈfleksəbl/', mean: 'adj. 灵活的；柔韧的', sentence: 'We need a flexible schedule.' },
      { word: 'generate', phonetic: '/ˈdʒenəreɪt/', mean: 'v. 产生；发生', sentence: 'The wind turbines generate electricity.' },
      { word: 'horizon', phonetic: '/həˈraɪzn/', mean: 'n. 地平线；视野', sentence: 'The sun sank below the horizon.' },
      { word: 'influence', phonetic: '/ˈɪnfluəns/', mean: 'n. 影响；v. 影响', sentence: 'His words influenced my decision.' },
      { word: 'journey', phonetic: '/ˈdʒɜːni/', mean: 'n. 旅行；行程', sentence: 'The journey took three hours.' },
      { word: 'knowledge', phonetic: '/ˈnɒlɪdʒ/', mean: 'n. 知识；学问', sentence: 'Knowledge is power.' },
      { word: 'landscape', phonetic: '/ˈlændskeɪp/', mean: 'n. 风景；景色', sentence: 'The landscape was breathtaking.' },
      { word: 'magnificent', phonetic: '/mæɡˈnɪfɪsnt/', mean: 'adj. 壮丽的；宏伟的', sentence: 'The palace was magnificent.' },
      { word: 'necessary', phonetic: '/ˈnesəsəri/', mean: 'adj. 必要的；必需的', sentence: 'Sleep is necessary for good health.' },
      { word: 'opportunity', phonetic: '/ˌɒpəˈtjuːnəti/', mean: 'n. 机会；时机', sentence: 'Don\'t miss this opportunity!' },
      { word: 'passionate', phonetic: '/ˈpæʃənət/', mean: 'adj. 热情的；充满激情的', sentence: 'She is passionate about music.' },
      { word: 'quality', phonetic: '/ˈkwɒləti/', mean: 'n. 质量；品质', sentence: 'Quality matters more than quantity.' },
      { word: 'resource', phonetic: '/rɪˈzɔːs/', mean: 'n. 资源；财力', sentence: 'We must use our resources wisely.' },
      { word: 'significant', phonetic: '/sɪɡˈnɪfɪkənt/', mean: 'adj. 重要的；有意义的', sentence: 'This is a significant discovery.' },
      { word: 'technology', phonetic: '/tekˈnɒlədʒi/', mean: 'n. 技术；科技', sentence: 'Technology changes rapidly.' },
      { word: 'ultimate', phonetic: '/ˈʌltɪmət/', mean: 'adj. 最终的；根本的', sentence: 'That was the ultimate challenge.' },
      { word: 'vulnerable', phonetic: '/ˈvʌlnərəbl/', mean: 'adj. 脆弱的；易受伤害的', sentence: 'Children are vulnerable to diseases.' },
      { word: 'witness', phonetic: '/ˈwɪtnəs/', mean: 'n. 目击者；v. 目睹', sentence: 'She witnessed the accident.' },
      { word: 'ambitious', phonetic: '/æmˈbɪʃəs/', mean: 'adj. 有雄心的；野心勃勃的', sentence: 'He is ambitious and hardworking.' },
      { word: 'benefit', phonetic: '/ˈbenɪfɪt/', mean: 'n. 利益；v. 受益', sentence: 'Exercise benefits your health.' }
    ]
    const withMeta = sampleWords.map(w => ({
      id: `word_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      bookId: 'book1',
      star: false,
      note: '',
      learnLevel: 0,
      nextReview: 0,
      ...w
    }))
    Storage.set(DB_KEYS.WORD_DATA, withMeta)
  }
}

// 获取所有词本
export function getBookList() {
  return Storage.get(DB_KEYS.BOOK_LIST) || []
}

// 新增词本
export function addBook(name) {
  const list = getBookList()
  const newBook = {
    id: `book_${Date.now()}`,
    name,
    createTime: Date.now()
  }
  list.push(newBook)
  Storage.set(DB_KEYS.BOOK_LIST, list)
  return newBook
}

// 获取指定词本的单词
export function getWordsByBook(bookId) {
  const allWords = Storage.get(DB_KEYS.WORD_DATA) || []
  return allWords.filter(item => item.bookId === bookId)
}

// 新增单个单词
export function addWord(wordItem) {
  const allWords = Storage.get(DB_KEYS.WORD_DATA) || []
  allWords.push({
    id: `word_${Date.now()}`,
    ...wordItem,
    star: false,
    note: '',
    learnLevel: 0, // 记忆等级 0-7
    nextReview: 0  // 下次复习时间戳
  })
  Storage.set(DB_KEYS.WORD_DATA, allWords)
}

// 更新单词
export function updateWord(wordId, data) {
  const allWords = Storage.get(DB_KEYS.WORD_DATA) || []
  const idx = allWords.findIndex(item => item.id === wordId)
  if (idx > -1) {
    allWords[idx] = { ...allWords[idx], ...data }
    Storage.set(DB_KEYS.WORD_DATA, allWords)
  }
}

// 删除单词
export function delWord(wordId) {
  let allWords = Storage.get(DB_KEYS.WORD_DATA) || []
  allWords = allWords.filter(item => item.id !== wordId)
  Storage.set(DB_KEYS.WORD_DATA, allWords)
}

// 获取新词数量（未学习过的词）
export function getNewWordsCount(bookId) {
  const words = getWordsByBook(bookId)
  return words.filter(item => item.learnLevel === 0).length
}

// 获取待复习单词（基于艾宾浩斯）
export function getReviewWords(bookId) {
  const now = Date.now()
  const words = getWordsByBook(bookId)
  return words.filter(item => item.nextReview > 0 && item.nextReview <= now)
}

// 答对-提升记忆等级，计算下次复习时间
export function wordRight(wordId) {
  trackDailyStudy()
  const allWords = Storage.get(DB_KEYS.WORD_DATA) || []
  const word = allWords.find(item => item.id === wordId)
  if (!word) return

  let level = word.learnLevel + 1
  if (level >= EBBINGHAUS.length) level = EBBINGHAUS.length - 1

  const nextTime = Date.now() + EBBINGHAUS[level] * 60 * 1000
  updateWord(wordId, { learnLevel: level, nextReview: nextTime })

  // 从错题本移除
  let wrong = Storage.get(DB_KEYS.WRONG_WORDS) || []
  wrong = wrong.filter(id => id !== wordId)
  Storage.set(DB_KEYS.WRONG_WORDS, wrong)
}

// 答错-重置等级，加入错题本
export function wordWrong(wordId) {
  trackDailyStudy()
  updateWord(wordId, { learnLevel: 0, nextReview: Date.now() + 5 * 60 * 1000 })

  let wrong = Storage.get(DB_KEYS.WRONG_WORDS) || []
  if (!wrong.includes(wordId)) {
    wrong.push(wordId)
    Storage.set(DB_KEYS.WRONG_WORDS, wrong)
  }
}

/** 记录每日学习数 */
function trackDailyStudy() {
  const record = Storage.get(DB_KEYS.LEARN_RECORD) || {}
  const today = new Date().toISOString().slice(0, 10)
  record[today] = (record[today] || 0) + 1
  Storage.set(DB_KEYS.LEARN_RECORD, record)
}

// 单词发音
export function speakWord(text, isUk = false) {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = isUk ? 'en-GB' : 'en-US'
  speechSynthesis.speak(utterance)
}