import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../utils/supabase'
import { LocalStore } from '../utils/localStore'
import { getStudentBookId, setStudentBookId } from '../utils/profile'

const CACHE_KEY = 'cache_books'
const COUNTS_KEY = 'cache_word_counts'

export const useBookStore = defineStore('book', () => {
  const bookList = ref([])
  const currentBookId = ref(null)
  const loading = ref(false)
  const wordCounts = ref({}) // ref 在 Pinia 中响应更可靠
  let loaded = false

  const currentBook = computed(() =>
    bookList.value.find(b => b.id === currentBookId.value) || { id: null, name: '' }
  )

  function getWordCount(bookId) {
    return wordCounts.value[bookId] ?? 0
  }

  /** 增/减/设置 某个词本的单词计数 */
  function updateWordCount(bookId, deltaOrValue, isSet = false) {
    wordCounts.value = {
      ...wordCounts.value,
      [bookId]: isSet ? deltaOrValue : (wordCounts.value[bookId] || 0) + deltaOrValue
    }
    saveCache()
  }

  /** 当前词本按学生记忆：每个学生接着上次的词本继续 */
  function restoreCurrentBook() {
    const saved = getStudentBookId()
    if (saved && bookList.value.some(b => b.id === saved)) {
      currentBookId.value = saved
      return
    }
    if (bookList.value.length) currentBookId.value = bookList.value[0].id
  }

  /** 从 localStorage 恢复缓存 */
  function restoreCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        bookList.value = JSON.parse(cached)
        if (bookList.value.length && !currentBookId.value) restoreCurrentBook()
      }
      const counts = localStorage.getItem(COUNTS_KEY)
      if (counts) wordCounts.value = JSON.parse(counts)
    } catch (e) { /* ignore */ }
  }

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(bookList.value))
      localStorage.setItem(COUNTS_KEY, JSON.stringify(wordCounts.value))
    } catch (e) { /* ignore */ }
  }

  /** 全量统计（只在首次加载时使用） */
  async function loadWordCounts() {
    if (!supabase) {
      const counts = {}
      for (const w of LocalStore.loadAllWords()) {
        counts[w.book_id] = (counts[w.book_id] || 0) + 1
      }
      wordCounts.value = counts
      return
    }
    const { data, error } = await supabase.from('words').select('book_id')
    if (error) return
    const counts = {}
    for (const w of data || []) counts[w.book_id] = (counts[w.book_id] || 0) + 1
    wordCounts.value = counts
  }

  async function loadBooks(force = false) {
    if (!loaded) restoreCache()
    if (loaded && !force) return

    loading.value = true
    if (!supabase) {
      bookList.value = LocalStore.loadBooks()
      if (bookList.value.length && !currentBookId.value) restoreCurrentBook()
      await loadWordCounts()
      saveCache()
      loaded = true
      loading.value = false
      return
    }
    const { data, error } = await supabase.from('books').select('*').order('created_at')
    if (error) throw error
    bookList.value = data || []
    if (bookList.value.length && !currentBookId.value) restoreCurrentBook()
    await loadWordCounts()
    saveCache() // 缓存到本地
    loaded = true
    loading.value = false
  }

  async function addBook(name) {
    if (!supabase) {
      const book = LocalStore.insertBook(name)
      selectBook(book.id)
      loaded = false
      await loadBooks(true)
      return book
    }
    const { data, error } = await supabase.from('books').insert({ name }).select().single()
    if (error) throw error
    if (data) { selectBook(data.id); loaded = false; await loadBooks(true) }
    return data
  }

  async function deleteBook(id) {
    if (!supabase) {
      LocalStore.deleteBook(id)
      if (currentBookId.value === id) {
        const next = bookList.value.find(b => b.id !== id)
        selectBook(next ? next.id : null)
      }
      loaded = false
      await loadBooks(true)
      return
    }
    await supabase.from('words').delete().eq('book_id', id)
    await supabase.from('books').delete().eq('id', id)
    if (currentBookId.value === id) {
      const next = bookList.value.find(b => b.id !== id)
      selectBook(next ? next.id : null)
    }
    loaded = false; await loadBooks(true)
  }

  function selectBook(id) {
    currentBookId.value = id
    setStudentBookId(id)
  }

  return {
    bookList, currentBookId, currentBook, loading, wordCounts, getWordCount, updateWordCount,
    loadBooks, loadWordCounts, addBook, deleteBook, selectBook
  }
})
