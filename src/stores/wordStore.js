import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, getPersonalProgress, savePersonalProgress, removePersonalProgress } from '../utils/supabase'
import { Storage, DB_KEYS } from '../utils/storage'

/** 记录每日学习数 */
function trackDailyStudy() {
  const record = Storage.get(DB_KEYS.LEARN_RECORD) || {}
  const today = new Date().toISOString().slice(0, 10)
  record[today] = (record[today] || 0) + 1
  Storage.set(DB_KEYS.LEARN_RECORD, record)
}

const CACHE_PREFIX = 'cache_words_'

export const useWordStore = defineStore('word', () => {
  const wordList = ref([])
  const studyQueue = ref([])
  const currentStudyWord = ref(null)
  const showAnswer = ref(false)
  const loading = ref(false)
  const loadedBookId = ref(null)
  const studyFilter = ref('') // '' = 全部, 'wrong' = 仅错题

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

  /** 从 localStorage 恢复缓存 */
  function restoreCache(bookId) {
    try {
      const cached = localStorage.getItem(CACHE_PREFIX + bookId)
      if (cached) {
        wordList.value = mergeWithProgress(JSON.parse(cached))
        loadedBookId.value = bookId
        return true
      }
    } catch (e) { /* ignore */ }
    return false
  }

  function saveCache(bookId, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + bookId, JSON.stringify(data))
    } catch (e) { /* ignore */ }
  }

  async function loadWords(bookId) {
    if (!supabase || !bookId) return
    // 缓存命中：同词本不重复请求
    if (loadedBookId.value === bookId && wordList.value.length) return
    // 先显示缓存，再后台刷新
    const hasCache = restoreCache(bookId)
    if (hasCache) {
      // 后台刷新
      loadWordsFromServer(bookId)
      return
    }
    await loadWordsFromServer(bookId)
  }

  async function loadWordsFromServer(bookId) {
    if (!supabase || !bookId) return
    loading.value = true
    const { data, error } = await supabase.from('words').select('*').eq('book_id', bookId).order('created_at')
    if (error) throw error
    const merged = mergeWithProgress(data)
    wordList.value = merged
    loadedBookId.value = bookId
    saveCache(bookId, data)
    loading.value = false
  }

  async function addWord(data) {
    if (!supabase) return
    loading.value = true
    const { data: inserted, error } = await supabase.from('words').insert({
      book_id: data.bookId, word: data.word,
      phonetic: data.phonetic || '', mean: data.mean || '', sentence: data.sentence || ''
    }).select().single()
    if (error) throw error
    if (inserted) {
      savePersonalProgress(inserted.id, { learnLevel: 0, nextReview: 0 })
      loadedBookId.value = null
      localStorage.removeItem(CACHE_PREFIX + data.bookId)
      await loadWordsFromServer(data.bookId)
    }
    loading.value = false
  }

  /** 批量插入单词（一次性提交，大幅提升导入速度） */
  async function batchAddWords(bookId, words) {
    if (!supabase || !words.length) return { count: 0 }
    loading.value = true
    const rows = words.map(w => ({
      book_id: bookId,
      word: w.word,
      phonetic: w.phonetic || '',
      mean: w.mean || '',
      sentence: w.sentence || ''
    }))
    const { data: inserted, error } = await supabase.from('words').insert(rows).select()
    if (error) throw error
    if (inserted && inserted.length) {
      for (const row of inserted) {
        savePersonalProgress(row.id, { learnLevel: 0, nextReview: 0 })
      }
      loadedBookId.value = null
      localStorage.removeItem(CACHE_PREFIX + bookId)
      await loadWordsFromServer(bookId)
    }
    loading.value = false
    return { count: inserted?.length || 0 }
  }

  async function deleteWord(id) {
    if (!supabase) return
    await supabase.from('words').delete().eq('id', id)
    removePersonalProgress(id)
    loadedBookId.value = null
  }

  function markRight(id) {
    trackDailyStudy()
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
    trackDailyStudy()
    savePersonalProgress(id, { learnLevel: 0, nextReview: Date.now() + 5 * 60 * 1000 })
    let wrong = Storage.get(DB_KEYS.WRONG_WORDS) || []
    if (!wrong.includes(id)) { wrong.push(id); Storage.set(DB_KEYS.WRONG_WORDS, wrong) }
  }

  function initStudyQueue(bookId) {
    if (studyFilter.value === 'wrong') {
      const wrongIds = Storage.get(DB_KEYS.WRONG_WORDS) || []
      studyQueue.value = wordList.value.filter(w => wrongIds.includes(w.id)).sort(() => Math.random() - 0.5)
      studyFilter.value = ''
    } else {
      const now = Date.now()
      const review = wordList.value.filter(w => w.nextReview > 0 && w.nextReview <= now)
      const newWords = wordList.value.filter(w => w.learnLevel === 0)
      studyQueue.value = [...review, ...newWords].sort(() => Math.random() - 0.5)
    }
    nextWord()
  }

  function nextWord() { showAnswer.value = false; currentStudyWord.value = studyQueue.value.shift() || null }
  function handleRight() { if (currentStudyWord.value) { markRight(currentStudyWord.value.id); nextWord() } }
  function handleWrong() { if (currentStudyWord.value) { markWrong(currentStudyWord.value.id); nextWord() } }

  return {
    wordList, studyQueue, currentStudyWord, showAnswer, loading, studyFilter,
    reviewCount, wrongWordList,
    loadWords, addWord, batchAddWords, deleteWord,
    markRight, markWrong,
    initStudyQueue, nextWord, handleRight, handleWrong
  }
})
