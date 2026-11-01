import defaultWords from './defaultWords.json'
import middleSchoolWords from './middleSchoolWords.json'

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

function ensureBook(books, idKey, name) {
  const storedId = localStorage.getItem(idKey)
  const existing = books.find(b => b.id === storedId)
  if (existing) return existing
  const book = { id: makeId('book'), name, created_at: new Date().toISOString() }
  books.push(book)
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
  const books = read(BOOKS_KEY, [])
  const book = ensureBook(books, DEFAULT_BOOK_ID_KEY, DEFAULT_BOOK_NAME)
  patchSentences(book, defaultWords)

  if (localStorage.getItem(SEED_VERSION_KEY) !== String(SEED_VERSION)) {
    insertMissingWords(book, defaultWords)
    localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION))
  }

  // 中考必背 2000 词：只在还没种过时建本，用户删掉后不会被重新塞回来
  if (localStorage.getItem(EXAM_SEED_VERSION_KEY) !== String(EXAM_SEED_VERSION)) {
    const examBook = ensureBook(books, EXAM_BOOK_ID_KEY, EXAM_BOOK_NAME)
    insertMissingWords(examBook, middleSchoolWords)
    localStorage.setItem(EXAM_SEED_VERSION_KEY, String(EXAM_SEED_VERSION))
  }

  write(BOOKS_KEY, books)
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
