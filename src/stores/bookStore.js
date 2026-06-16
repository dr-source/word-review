import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../utils/supabase'
import { ElMessage } from 'element-plus'

export const useBookStore = defineStore('book', () => {
  const bookList = ref([])
  const currentBookId = ref(null)
  const loading = ref(false)

  const currentBook = computed(() =>
    bookList.value.find(b => b.id === currentBookId.value) || { id: null, name: '' }
  )

  async function loadBooks() {
    if (!supabase) { ElMessage.error('Supabase 未配置'); return }
    loading.value = true
    const { data, error } = await supabase.from('books').select('*').order('created_at')
    if (error) { ElMessage.error('加载词本失败：' + error.message); loading.value = false; return }
    bookList.value = data || []
    if (bookList.value.length && !currentBookId.value) {
      currentBookId.value = bookList.value[0].id
    }
    loading.value = false
  }

  async function addBook(name) {
    if (!supabase) { ElMessage.error('Supabase 未配置'); return }
    const { data, error } = await supabase.from('books').insert({ name }).select().single()
    if (error) { ElMessage.error('添加词本失败：' + error.message); return }
    if (data) {
      currentBookId.value = data.id
      await loadBooks()
    }
    return data
  }

  async function deleteBook(id) {
    if (!supabase) return
    await supabase.from('words').delete().eq('book_id', id)
    await supabase.from('books').delete().eq('id', id)
    if (currentBookId.value === id) {
      currentBookId.value = bookList.value.length > 1
        ? bookList.value.find(b => b.id !== id)?.id || null
        : null
    }
    await loadBooks()
  }

  function selectBook(id) {
    currentBookId.value = id
  }

  return { bookList, currentBookId, currentBook, loading, loadBooks, addBook, deleteBook, selectBook }
})
