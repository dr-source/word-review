import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../utils/supabase'

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

  /** 增/减某个词本的单词计数（实时更新，不依赖全量统计） */
  function updateWordCount(bookId, delta) {
    wordCounts.value = {
      ...wordCounts.value,
      [bookId]: (wordCounts.value[bookId] || 0) + delta
    }
    saveCache()
  }

  /** 从 localStorage 恢复缓存 */
  function restoreCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        bookList.value = JSON.parse(cached)
        if (bookList.value.length && !currentBookId.value) currentBookId.value = bookList.value[0].id
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
    if (!supabase) return
    const { data, error } = await supabase.from('words').select('book_id')
    if (error) return
    const counts = {}
    for (const w of data || []) counts[w.book_id] = (counts[w.book_id] || 0) + 1
    wordCounts.value = counts
  }

  async function loadBooks(force = false) {
    if (!supabase) return
    // 先恢复缓存，立即显示
    if (!loaded) restoreCache()
    if (loaded && !force) return

    loading.value = true
    const { data, error } = await supabase.from('books').select('*').order('created_at')
    if (error) throw error
    bookList.value = data || []
    if (bookList.value.length && !currentBookId.value) currentBookId.value = bookList.value[0].id
    await loadWordCounts()
    saveCache() // 缓存到本地
    loaded = true
    loading.value = false
  }

  async function addBook(name) {
    if (!supabase) return
    const { data, error } = await supabase.from('books').insert({ name }).select().single()
    if (error) throw error
    if (data) { currentBookId.value = data.id; loaded = false; await loadBooks(true) }
    return data
  }

  async function deleteBook(id) {
    if (!supabase) return
    await supabase.from('words').delete().eq('book_id', id)
    await supabase.from('books').delete().eq('id', id)
    if (currentBookId.value === id) {
      currentBookId.value = bookList.value.length > 1
        ? bookList.value.find(b => b.id !== id)?.id || null : null
    }
    loaded = false; await loadBooks(true)
  }

  function selectBook(id) { currentBookId.value = id }

  return { bookList, currentBookId, currentBook, loading, wordCounts, getWordCount, updateWordCount,
    loadBooks, loadWordCounts, addBook, deleteBook, selectBook }
})
