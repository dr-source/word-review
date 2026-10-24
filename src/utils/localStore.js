import defaultWords from './defaultWords.json'

// 本地回退存储：未配置 Supabase 时使用 localStorage 保存词本和单词
const BOOKS_KEY = 'word_review_local_books'
const WORDS_KEY = 'word_review_local_words'
const SEED_VERSION_KEY = 'word_review_default_seed_version'
const DEFAULT_BOOK_ID_KEY = 'word_review_default_book_id'
const SEED_VERSION = 2

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

function ensureDefaultBook(books) {
  const storedId = localStorage.getItem(DEFAULT_BOOK_ID_KEY)
  const existing = books.find(b => b.id === storedId)
  if (existing) return existing
  const book = { id: makeId('book'), name: '中考英语核心高频688词汇表', created_at: new Date().toISOString() }
  books.push(book)
  localStorage.setItem(DEFAULT_BOOK_ID_KEY, book.id)
  return book
}

function seedDefaultWords() {
  const books = read(BOOKS_KEY, [])
  const book = ensureDefaultBook(books)
  const words = read(WORDS_KEY, [])
  const seeded = new Map(words.filter(w => w.book_id === book.id).map(w => [w.word.toLowerCase(), w]))

  // 老版本种子词没有例句：升级时按单词补上，不覆盖用户自己写的内容
  let patched = false
  for (const w of defaultWords) {
    const hit = seeded.get(w.word.toLowerCase())
    if (hit && !hit.sentence && w.sentence) {
      hit.sentence = w.sentence
      patched = true
    }
  }
  if (patched) write(WORDS_KEY, words)

  if (localStorage.getItem(SEED_VERSION_KEY) === String(SEED_VERSION)) {
    write(BOOKS_KEY, books)
    return
  }

  const items = []
  for (const w of defaultWords) {
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
  write(BOOKS_KEY, books)
  if (items.length) {
    words.push(...items)
    write(WORDS_KEY, words)
  }
  localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION))
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
