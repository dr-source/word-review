import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, getPersonalProgress, savePersonalProgress, removePersonalProgress } from '../utils/supabase'
import { Storage, DB_KEYS } from '../utils/storage'

export const useWordStore = defineStore('word', () => {
  const wordList = ref([])
  const studyQueue = ref([])
  const currentStudyWord = ref(null)
  const showAnswer = ref(false)
  const loading = ref(false)
  const loadedBookId = ref(null) // 缓存：当前已加载的词本 ID

  // 合并共享单词和个人进度
  function mergeWithProgress(dbWords) {
    const progress = getPersonalProgress()
    return (dbWords || []).map(w => ({
      id: w.id, bookId: w.book_id,
      word: w.word, phonetic: w.phonetic || '', mean: w.mean || '', sentence: w.sentence || '',
      star: false, note: '', learnLevel: 0, nextReview: 0,
      ...(progress[w.id] || {})
    }))
  }

  const reviewCount = computed(() => {
    if (!wordList.value.length) return 0
    const now = Date.now()
    return wordList.value.filter(w => w.nextReview > 0 && w.nextReview <= now).length +
      wordList.value.filter(w => w.learnLevel === 0).length
  })

  const wrongWordList = computed(() => {
    const wrongIds = Storage.get(DB_KEYS.WRONG_WORDS) || []
    return wordList.value.filter(item => wrongIds.includes(item.id))
  })

  async function loadWords(bookId) {
    if (!supabase || !bookId) return
    // 缓存命中：同词本不重复请求
    if (loadedBookId.value === bookId && wordList.value.length) return
    loading.value = true
    const { data, error } = await supabase.from('words').select('*').eq('book_id', bookId).order('created_at')
    if (error) throw error
    wordList.value = mergeWithProgress(data)
    loadedBookId.value = bookId
    loading.value = false
  }

  /** 强制刷新（增删后调用） */
  async function reloadWords(bookId) {
    loadedBookId.value = null
    await loadWords(bookId || loadedBookId.value)
  }

  async function addWord(data) {
    if (!supabase) return
    const { data: inserted, error } = await supabase.from('words').insert({
      book_id: data.bookId, word: data.word,
      phonetic: data.phonetic || '', mean: data.mean || '', sentence: data.sentence || ''
    }).select().single()
    if (error) throw error
    if (inserted) {
      savePersonalProgress(inserted.id, { learnLevel: 0, nextReview: 0 })
      loadedBookId.value = null // 清除缓存
      await loadWords(data.bookId)
    }
  }

  async function deleteWord(id) {
    if (!supabase) return
    await supabase.from('words').delete().eq('id', id)
    removePersonalProgress(id)
    loadedBookId.value = null
  }

  function markRight(id) {
    const progress = getPersonalProgress()
    const word = progress[id] || { learnLevel: 0 }
    let level = Math.min((word.learnLevel || 0) + 1, 7)
    const intervals = [5, 30, 1440, 2880, 5760, 10080, 20160, 43200]
    savePersonalProgress(id, { learnLevel: level, nextReview: Date.now() + intervals[level] * 60 * 1000 })
    let wrong = Storage.get(DB_KEYS.WRONG_WORDS) || []
    wrong = wrong.filter(w => w !== id)
    Storage.set(DB_KEYS.WRONG_WORDS, wrong)
  }

  function markWrong(id) {
    savePersonalProgress(id, { learnLevel: 0, nextReview: Date.now() + 5 * 60 * 1000 })
    let wrong = Storage.get(DB_KEYS.WRONG_WORDS) || []
    if (!wrong.includes(id)) { wrong.push(id); Storage.set(DB_KEYS.WRONG_WORDS, wrong) }
  }

  function initStudyQueue(bookId) {
    const now = Date.now()
    const review = wordList.value.filter(w => w.nextReview > 0 && w.nextReview <= now)
    const newWords = wordList.value.filter(w => w.learnLevel === 0)
    studyQueue.value = [...review, ...newWords].sort(() => Math.random() - 0.5)
    nextWord()
  }

  function nextWord() { showAnswer.value = false; currentStudyWord.value = studyQueue.value.shift() || null }
  function handleRight() { if (currentStudyWord.value) { markRight(currentStudyWord.value.id); nextWord() } }
  function handleWrong() { if (currentStudyWord.value) { markWrong(currentStudyWord.value.id); nextWord() } }

  return {
    wordList, studyQueue, currentStudyWord, showAnswer, loading,
    reviewCount, wrongWordList,
    loadWords, reloadWords, addWord, deleteWord,
    markRight, markWrong,
    initStudyQueue, nextWord, handleRight, handleWrong
  }
})
