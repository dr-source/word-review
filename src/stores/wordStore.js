import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getWordsByBook, addWord as addWordUtil, delWord, updateWord,
  wordRight, wordWrong, getReviewWords, getNewWordsCount
} from '../utils/word'
import { Storage, DB_KEYS } from '../utils/storage'
import { useBookStore } from './bookStore'

export const useWordStore = defineStore('word', () => {
  const wordList = ref([])
  const studyQueue = ref([])
  const currentStudyWord = ref(null)
  const showAnswer = ref(false)

  // ---- Getters ----
  const reviewCount = computed(() => {
    const bookId = useBookStore().currentBookId
    if (!bookId) return 0
    const review = getReviewWords(bookId).length
    const newWords = getNewWordsCount(bookId)
    return review + newWords
  })

  const wrongWordList = computed(() => {
    const wrongIds = Storage.get(DB_KEYS.WRONG_WORDS) || []
    const all = Storage.get(DB_KEYS.WORD_DATA) || []
    return all.filter(item => wrongIds.includes(item.id))
  })

  // ---- Actions ----
  function loadWords(bookId) {
    wordList.value = getWordsByBook(bookId)
  }

  function addWord(data) {
    addWordUtil(data)
    loadWords(data.bookId)
  }

  function deleteWord(id) {
    delWord(id)
  }

  function editWord(id, data) {
    updateWord(id, data)
  }

  function markRight(id) {
    wordRight(id)
  }

  function markWrong(id) {
    wordWrong(id)
  }

  // ---- Study Queue ----
  function initStudyQueue(bookId) {
    const review = getReviewWords(bookId)
    const all = getWordsByBook(bookId).filter(item => item.learnLevel === 0)
    studyQueue.value = [...review, ...all]
    nextWord()
  }

  function nextWord() {
    showAnswer.value = false
    currentStudyWord.value = studyQueue.value.shift() || null
  }

  function handleRight() {
    if (!currentStudyWord.value) return
    wordRight(currentStudyWord.value.id)
    nextWord()
  }

  function handleWrong() {
    if (!currentStudyWord.value) return
    wordWrong(currentStudyWord.value.id)
    nextWord()
  }

  return {
    wordList, studyQueue, currentStudyWord, showAnswer,
    reviewCount, wrongWordList,
    loadWords, addWord, deleteWord, editWord,
    markRight, markWrong,
    initStudyQueue, nextWord, handleRight, handleWrong
  }
})
