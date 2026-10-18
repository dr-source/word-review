import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../utils/supabase'
import { LocalStore } from '../utils/localStore'
import {
  getProgress, saveProgress, getWrongIds, getWrongCounts, addWrong, removeWrong,
  trackStudy, getTodayStudiedIds, getSettings, saveSettings, getTasks, saveTask,
  intervalMs, todayStr
} from '../utils/profile'

const CACHE_PREFIX = 'cache_words_'
const MAX_LEVEL = 7

/** 固定种子洗牌：同一天、同一任务顺序一致，选择/拼写/翻卡对得上 */
function seededShuffle(list, seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h ^= h >>> 13
    const j = Math.abs(h) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export const useWordStore = defineStore('word', () => {
  const wordList = ref([])
  const rawWords = ref([])
  const studyQueue = ref([])
  const currentStudyWord = ref(null)
  const showAnswer = ref(false)
  const loading = ref(false)
  const loadedBookId = ref(null)
  const studyFilter = ref('') // '' = 今日任务, 'wrong' = 仅错题

  const settings = getSettings()
  const dailySize = ref(settings.dailySize)
  const shuffleMode = ref(settings.shuffle)
  const task = ref(null) // { date, ids, size, bookId }
  // 今日已学词 id 的响应式快照：localStorage 本身不响应，写完必须同步一次
  const studiedIds = ref(getTodayStudiedIds())

  function refreshToday() {
    studiedIds.value = getTodayStudiedIds()
  }

  /** 把原始词条与当前学生的进度、错题状态合并 */
  function applyProgress() {
    const progress = getProgress()
    const wrongIds = getWrongIds()
    wordList.value = rawWords.value.map(w => ({
      id: w.id,
      bookId: w.book_id,
      book_id: w.book_id,
      word: w.word,
      phonetic: w.phonetic || '',
      mean: w.mean || '',
      sentence: w.sentence || '',
      star: false,
      note: '',
      learnLevel: 0,
      nextReview: 0,
      ...(progress[w.id] || {}),
      wrong: wrongIds.includes(w.id)
    }))
  }

  const reviewCount = computed(() => {
    if (!wordList.value.length) return 0
    const now = Date.now()
    return wordList.value.filter(w => w.nextReview > 0 && w.nextReview <= now).length +
      wordList.value.filter(w => w.learnLevel === 0).length
  })

  const wrongWordList = computed(() => {
    const counts = getWrongCounts()
    return wordList.value
      .filter(item => item.wrong)
      .map(item => ({
        ...item,
        wrongCount: counts[item.id]?.count || 1,
        lastWrongAt: counts[item.id]?.lastAt || 0
      }))
  })

  /** 今日任务单词，按任务顺序（开启乱序后按当天固定种子洗牌） */
  const taskWords = computed(() => {
    const ids = task.value?.ids || []
    const map = new Map(wordList.value.map(w => [w.id, w]))
    const list = ids.map(id => map.get(id)).filter(Boolean)
    if (!shuffleMode.value) return list
    return seededShuffle(list, `${task.value?.bookId}_${task.value?.date}_${ids.length}`)
  })

  const taskSize = computed(() => task.value?.ids?.length || 0)
  const taskDoneCount = computed(() => {
    const ids = new Set(task.value?.ids || [])
    return studiedIds.value.filter(id => ids.has(id)).length
  })

  /** 从 localStorage 恢复缓存 */
  function restoreCache(bookId) {
    try {
      const cached = localStorage.getItem(CACHE_PREFIX + bookId)
      if (cached) {
        rawWords.value = JSON.parse(cached)
        applyProgress()
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
    if (!bookId) return
    if (loadedBookId.value === bookId && wordList.value.length) return
    const hasCache = restoreCache(bookId)
    if (hasCache) {
      loadWordsFromServer(bookId)
      return
    }
    await loadWordsFromServer(bookId)
  }

  async function loadWordsFromServer(bookId) {
    if (!bookId) return
    loading.value = true
    if (!supabase) {
      const data = LocalStore.loadWords(bookId)
      rawWords.value = data
      applyProgress()
      loadedBookId.value = bookId
      saveCache(bookId, data)
      loading.value = false
      return
    }
    const { data, error } = await supabase.from('words').select('*').eq('book_id', bookId).order('created_at')
    if (error) throw error
    rawWords.value = data || []
    applyProgress()
    loadedBookId.value = bookId
    saveCache(bookId, rawWords.value)
    loading.value = false
  }

  async function addWord(data) {
    if (!data.word) throw new Error('单词不能为空')
    loading.value = true
    if (!supabase) {
      const inserted = LocalStore.insertWord({
        book_id: data.bookId,
        word: data.word,
        phonetic: data.phonetic || '',
        mean: data.mean || '',
        sentence: data.sentence || ''
      })
      loadedBookId.value = null
      localStorage.removeItem(CACHE_PREFIX + data.bookId)
      await loadWordsFromServer(data.bookId)
      loading.value = false
      return inserted
    }
    const { data: inserted, error } = await supabase.from('words').insert({
      book_id: data.bookId,
      phonetic: data.phonetic || '',
      word: data.word,
      mean: data.mean || '',
      sentence: data.sentence || ''
    }).select().single()
    if (error) throw error
    if (inserted) {
      loadedBookId.value = null
      localStorage.removeItem(CACHE_PREFIX + data.bookId)
      await loadWordsFromServer(data.bookId)
    }
    loading.value = false
  }

  /** 批量插入单词（一次性提交，大幅提升导入速度） */
  async function batchAddWords(bookId, words) {
    if (!words.length) return { count: 0 }
    loading.value = true
    const rows = words.map(w => ({
      book_id: bookId,
      word: w.word,
      phonetic: w.phonetic || '',
      mean: w.mean || '',
      sentence: w.sentence || ''
    }))
    if (!supabase) {
      const inserted = LocalStore.insertWords(rows)
      loadedBookId.value = null
      localStorage.removeItem(CACHE_PREFIX + bookId)
      await loadWordsFromServer(bookId)
      loading.value = false
      return { count: inserted.length }
    }
    const { data: inserted, error } = await supabase.from('words').insert(rows).select()
    if (error) throw error
    if (inserted && inserted.length) {
      loadedBookId.value = null
      localStorage.removeItem(CACHE_PREFIX + bookId)
      await loadWordsFromServer(bookId)
    }
    loading.value = false
    return { count: inserted?.length || 0 }
  }

  async function deleteWord(id) {
    if (!supabase) {
      LocalStore.deleteWord(id)
      removeWrong(id)
      loadedBookId.value = null
      return
    }
    await supabase.from('words').delete().eq('id', id)
    removeWrong(id)
    loadedBookId.value = null
  }

  function syncWordItem(id) {
    const progress = getProgress()
    const wrongIds = getWrongIds()
    const item = wordList.value.find(w => w.id === id)
    if (!item) return
    Object.assign(item, { learnLevel: 0, nextReview: 0, ...(progress[id] || {}) }, { wrong: wrongIds.includes(id) })
  }

  /** 认识：升一级；同一天重复答对不再升级，避免一遍就“掌握” */
  function markRight(id) {
    const progress = getProgress()
    const item = progress[id] || {}
    const date = todayStr()
    let level = item.learnLevel || 0
    if (item.lastLevelDate !== date) level = Math.min(level + 1, MAX_LEVEL)
    saveProgress(id, {
      learnLevel: level,
      nextReview: Date.now() + intervalMs(level),
      lastLevelDate: date
    })
    removeWrong(id)
    trackStudy(id)
    refreshToday()
    syncWordItem(id)
  }

  /** 模糊：等级不升、30 分钟后重新出现，并计入错题本 */
  function markHard(id) {
    addWrong(id)
    const progress = getProgress()
    const level = progress[id]?.learnLevel || 0
    saveProgress(id, { learnLevel: level, nextReview: Date.now() + 30 * 60 * 1000 })
    trackStudy(id)
    refreshToday()
    syncWordItem(id)
  }

  /** 不认识：等级归零、5 分钟后重新出现，计入错题本 */
  function markWrong(id) {
    addWrong(id)
    saveProgress(id, { learnLevel: 0, nextReview: Date.now() + 5 * 60 * 1000 })
    trackStudy(id)
    refreshToday()
    syncWordItem(id)
  }

  /**
   * 生成/读取今天的任务：先安排到期复习（按到期先后），再补新词，取前 dailySize 个。
   * 同一天同一词本只生成一次，第二天自动生成新的。
   */
  function ensureDailyTask(bookId, force = false) {
    const book = bookId || loadedBookId.value
    if (!book) { task.value = null; return null }
    const date = todayStr()
    const cached = getTasks()[book]
    if (!force && cached && cached.date === date) {
      task.value = cached
      return cached
    }
    const now = Date.now()
    const progress = getProgress()
    const due = rawWords.value
      .filter(w => {
        const p = progress[w.id]
        return p && p.learnLevel > 0 && p.nextReview > 0 && p.nextReview <= now
      })
      .sort((a, b) => (progress[a.id].nextReview || 0) - (progress[b.id].nextReview || 0))
    const fresh = rawWords.value.filter(w => {
      const p = progress[w.id]
      return !p || !p.learnLevel
    })
    const ids = []
    const seen = new Set()
    for (const w of [...due, ...fresh]) {
      if (ids.length >= dailySize.value) break
      if (seen.has(w.id)) continue
      seen.add(w.id)
      ids.push(w.id)
    }
    const next = { date, ids, size: dailySize.value, bookId: book }
    saveTask(book, next)
    task.value = next
    return next
  }

  function regenerateTask(bookId) {
    return ensureDailyTask(bookId || loadedBookId.value, true)
  }

  function setDailySize(size) {
    const value = Math.min(100, Math.max(5, Math.round(Number(size) || 33)))
    dailySize.value = value
    saveSettings({ dailySize: value })
    return value
  }

  function setShuffle(value) {
    shuffleMode.value = !!value
    saveSettings({ shuffle: shuffleMode.value })
  }

  function initStudyQueue(bookId) {
    const book = bookId || loadedBookId.value
    if (studyFilter.value === 'wrong') {
      studyQueue.value = wordList.value.filter(w => w.wrong)
      studyFilter.value = ''
    } else {
      ensureDailyTask(book)
      studyQueue.value = [...taskWords.value]
    }
    refreshToday()
    nextWord()
  }

  function nextWord() {
    showAnswer.value = false
    currentStudyWord.value = studyQueue.value.shift() || null
  }

  function handleRight() {
    if (currentStudyWord.value) { markRight(currentStudyWord.value.id); nextWord() }
  }

  function handleWrong() {
    if (currentStudyWord.value) { markWrong(currentStudyWord.value.id); nextWord() }
  }

  return {
    wordList, rawWords, studyQueue, currentStudyWord, showAnswer, loading, studyFilter,
    dailySize, shuffleMode, task, taskWords, taskSize, taskDoneCount,
    reviewCount, wrongWordList,
    loadWords, addWord, batchAddWords, deleteWord,
    markRight, markHard, markWrong,
    ensureDailyTask, regenerateTask, setDailySize, setShuffle,
    initStudyQueue, nextWord, handleRight, handleWrong
  }
})
