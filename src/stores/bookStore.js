import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getBookList, addBook as addBookUtil, getWordsByBook } from '../utils/word'
import { Storage, DB_KEYS } from '../utils/storage'

export const useBookStore = defineStore('book', () => {
  const bookList = ref([])
  const currentBookId = ref('')

  const currentBook = computed(() =>
    bookList.value.find(b => b.id === currentBookId.value) || { id: '', name: '' }
  )

  function loadBooks() {
    bookList.value = getBookList()
    if (bookList.value.length && !currentBookId.value) {
      currentBookId.value = bookList.value[0].id
    }
  }

  function addBook(name) {
    const book = addBookUtil(name)
    loadBooks()
    currentBookId.value = book.id
    return book
  }

  function deleteBook(id) {
    // 删除词本
    let list = Storage.get(DB_KEYS.BOOK_LIST) || []
    list = list.filter(b => b.id !== id)
    Storage.set(DB_KEYS.BOOK_LIST, list)

    // 级联删除该词本下的所有单词
    let allWords = Storage.get(DB_KEYS.WORD_DATA) || []
    allWords = allWords.filter(w => w.bookId !== id)
    Storage.set(DB_KEYS.WORD_DATA, allWords)

    // 清理错题本中属于该词本的单词引用
    const deletedIds = (getWordsByBook(id) || []).map(w => w.id)
    let wrong = Storage.get(DB_KEYS.WRONG_WORDS) || []
    wrong = wrong.filter(wId => !deletedIds.includes(wId))
    Storage.set(DB_KEYS.WRONG_WORDS, wrong)

    if (currentBookId.value === id) {
      currentBookId.value = list.length ? list[0].id : ''
    }
    loadBooks()
  }

  function selectBook(id) {
    currentBookId.value = id
  }

  return { bookList, currentBookId, currentBook, loadBooks, addBook, deleteBook, selectBook }
})
