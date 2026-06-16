import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import { supabase } from '../utils/supabase'

export const useBookStore = defineStore('book', () => {
  const bookList = ref([])
  const currentBookId = ref(null)
  const loading = ref(false)
  const wordCounts = reactive({}) // { bookId: count }

  const currentBook = computed(() =>
    bookList.value.find(b => b.id === currentBookId.value) || { id: null, name: '' }
  )

  function getWordCount(bookId) {
    return wordCounts[bookId] || 0
  }

  async function loadWordCounts() {
    if (!supabase) return
    const { data, error } = await supabase
      .from('words')
      .select('book_id')
    if (error) return
    const counts = {}
    for (const w of data || []) {
      counts[w.book_id] = (counts[w.book_id] || 0) + 1
    }
    Object.assign(wordCounts, counts)
  }

  async function loadBooks() {
    if (!supabase) return
    loading.value = true
    const { data, error } = await supabase.from('books').select('*').order('created_at')
    if (error) throw error
    bookList.value = data || []
    if (bookList.value.length && !currentBookId.value) currentBookId.value = bookList.value[0].id
    await loadWordCounts()
    loading.value = false
  }

  async function addBook(name) {
    if (!supabase) return
    const { data, error } = await supabase.from('books').insert({ name }).select().single()
    if (error) throw error
    if (data) { currentBookId.value = data.id; await loadBooks() }
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
    await loadBooks()
  }

  function selectBook(id) { currentBookId.value = id }

  return { bookList, currentBookId, currentBook, loading, wordCounts, getWordCount,
    loadBooks, loadWordCounts, addBook, deleteBook, selectBook }
})
