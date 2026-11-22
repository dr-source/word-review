import defaultWords from './defaultWords.json'
import middleSchoolWords from './middleSchoolWords.json'
import grade8Words from './grade8Words.json'

// 本地回退存储：未配置 Supabase 时使用 localStorage 保存词本和单词
const BOOKS_KEY = 'word_review_local_books'
const WORDS_KEY = 'word_review_local_words'
const SEED_VERSION_KEY = 'word_review_default_seed_version'
const DEFAULT_BOOK_ID_KEY = 'word_review_default_book_id'
const SEED_VERSION = 3
// 第二本内置词本：中考必背 2000 词（从 docx 词表导入），用独立的种子版本号
const EXAM_BOOK_ID_KEY = 'word_review_exam_book_id'
const EXAM_SEED_VERSION_KEY = 'word_review_exam_seed_version'
const EXAM_SEED_VERSION = 1
const DEFAULT_BOOK_NAME = '中考英语核心高频688词汇表'
export const EXAM_BOOK_NAME = '中考必背2000英语词汇'
// 第三本内置词本：2025 秋八上英语单词表（从 PDF 词表导入，v2 起带单元号）
const GRADE8_BOOK_ID_KEY = 'word_review_grade8_book_id'
const GRADE8_SEED_VERSION_KEY = 'word_review_grade8_seed_version'
const GRADE8_SEED_VERSION = 2
export const GRADE8_BOOK_NAME = '2025秋八上英语单词表'

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function sortByCreatedAt(items) {
  return items.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
}

/**
 * 取（或建）内置词本。每次都重读 BOOKS_KEY 并按 id / 同名复用，建好立刻落盘：
 * 多个标签页同时首启时，各种子不会各建一本空词本互相覆盖。
 */
function ensureBook(idKey, name) {
  const books = read(BOOKS_KEY, [])
  const storedId = localStorage.getItem(idKey)
  const existing = books.find(b => b.id === storedId) || books.find(b => b.name === name)
  if (existing) {
    localStorage.setItem(idKey, existing.id)
    return existing
  }
  const book = { id: makeId('book'), name, created_at: new Date().toISOString() }
  write(BOOKS_KEY, [...books, book])
  localStorage.setItem(idKey, book.id)
  return book
}

/** 已种过的词条只补例句，不覆盖用户自己改过的内容 */
function patchSentences(book, source) {
  const words = read(WORDS_KEY, [])
  const seeded = new Map(words.filter(w => w.book_id === book.id).map(w => [w.word.toLowerCase(), w]))
  let patched = false
  for (const w of source) {
    const hit = seeded.get(w.word.toLowerCase())
    if (hit && !hit.sentence && w.sentence) {
      hit.sentence = w.sentence
      patched = true
    }
  }
  if (patched) write(WORDS_KEY, words)
}

/** 已种过的词条只补单元号，不动其它字段（老数据升级用） */
function patchUnits(book, source) {
  const words = read(WORDS_KEY, [])
  const seeded = new Map(words.filter(w => w.book_id === book.id).map(w => [w.word.toLowerCase(), w]))
  let patched = false
  for (const w of source) {
    const hit = seeded.get(w.word.toLowerCase())
    if (hit && !hit.unit && w.unit) {
      hit.unit = w.unit
      patched = true
    }
  }
  if (patched) write(WORDS_KEY, words)
}

/** 按小写单词幂等种入，重复执行不会重复插入 */
function insertMissingWords(book, source) {
  const words = read(WORDS_KEY, [])
  const seeded = new Map(words.filter(w => w.book_id === book.id).map(w => [w.word.toLowerCase(), w]))
  const items = []
  for (const w of source) {
    const key = w.word.toLowerCase()
    if (seeded.has(key)) continue
    const item = {
      book_id: book.id,
      word: w.word,
      phonetic: w.phonetic || '',
      mean: w.mean || '',
      sentence: w.sentence || '',
      unit: w.unit || '',
      id: makeId('word'),
      created_at: new Date().toISOString()
    }
    seeded.set(key, item)
    items.push(item)
  }
  if (items.length) {
    words.push(...items)
    write(WORDS_KEY, words)
  }
}

function seedDefaultWords() {
  const book = ensureBook(DEFAULT_BOOK_ID_KEY, DEFAULT_BOOK_NAME)
  patchSentences(book, defaultWords)

  if (localStorage.getItem(SEED_VERSION_KEY) !== String(SEED_VERSION)) {
    insertMissingWords(book, defaultWords)
    localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION))
  }

  // 中考必背 2000 词：只在还没种过时建本，用户删掉后不会被重新塞回来
  if (localStorage.getItem(EXAM_SEED_VERSION_KEY) !== String(EXAM_SEED_VERSION)) {
    const examBook = ensureBook(EXAM_BOOK_ID_KEY, EXAM_BOOK_NAME)
    insertMissingWords(examBook, middleSchoolWords)
    localStorage.setItem(EXAM_SEED_VERSION_KEY, String(EXAM_SEED_VERSION))
  }

  // 2025 秋八上英语单词表：同样只种一次；老数据升级时只补单元号，不把用户删掉的词塞回来
  const grade8StoredId = localStorage.getItem(GRADE8_BOOK_ID_KEY)
  const grade8Books = read(BOOKS_KEY, [])
  const grade8Existing = grade8StoredId
    ? grade8Books.find(b => b.id === grade8StoredId)
    : grade8Books.find(b => b.name === GRADE8_BOOK_NAME)
  if (grade8Existing) {
    patchUnits(grade8Existing, grade8Words)
    localStorage.setItem(GRADE8_BOOK_ID_KEY, grade8Existing.id)
    localStorage.setItem(GRADE8_SEED_VERSION_KEY, String(GRADE8_SEED_VERSION))
  } else if (!grade8StoredId && localStorage.getItem(GRADE8_SEED_VERSION_KEY) !== String(GRADE8_SEED_VERSION)) {
    const grade8Book = ensureBook(GRADE8_BOOK_ID_KEY, GRADE8_BOOK_NAME)
    insertMissingWords(grade8Book, grade8Words)
    localStorage.setItem(GRADE8_SEED_VERSION_KEY, String(GRADE8_SEED_VERSION))
  }
}

export const LocalStore = {
  loadBooks() {
    seedDefaultWords()
    return sortByCreatedAt(read(BOOKS_KEY, []))
  },

  insertBook(name) {
    const books = read(BOOKS_KEY, [])
    const book = { id: makeId('book'), name, created_at: new Date().toISOString() }
    books.push(book)
    write(BOOKS_KEY, books)
    return book
  },

  deleteBook(id) {
    write(BOOKS_KEY, read(BOOKS_KEY, []).filter(b => b.id !== id))
    LocalStore.deleteWordsByBook(id)
  },

  deleteWordsByBook(bookId) {
    write(WORDS_KEY, read(WORDS_KEY, []).filter(w => w.book_id !== bookId))
  },

  loadWords(bookId) {
    return sortByCreatedAt(read(WORDS_KEY, []).filter(w => w.book_id === bookId))
  },

  loadAllWords() {
    return read(WORDS_KEY, [])
  },

  insertWord(row) {
    const words = read(WORDS_KEY, [])
    const item = { ...row, id: makeId('word'), created_at: new Date().toISOString() }
    words.push(item)
    write(WORDS_KEY, words)
    return item
  },

  insertWords(rows) {
    const words = read(WORDS_KEY, [])
    const items = rows.map(row => ({ ...row, id: makeId('word'), created_at: new Date().toISOString() }))
    words.push(...items)
    write(WORDS_KEY, words)
    return items
  },

  deleteWord(id) {
    write(WORDS_KEY, read(WORDS_KEY, []).filter(w => w.id !== id))
  },

  countWords(bookId) {
    const words = read(WORDS_KEY, [])
    if (!bookId) return words.length
    return words.filter(w => w.book_id === bookId).length
  }
}
