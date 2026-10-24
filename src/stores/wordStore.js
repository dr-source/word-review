import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../utils/supabase'
import { LocalStore } from '../utils/localStore'
import {
  getProgress, saveProgress, getWrongIds, getWrongCounts, addWrong, removeWrong,
  trackStudy, getTodayStudiedIds, getSettings, saveSettings, getTasks, saveTask,
  intervalMs, todayStr
} from '../utils/profile'

// 缓存格式变了就换前缀，避免老缓存里没有例句
const CACHE_PREFIX = 'cache_words_v2_'
const MAX_LEVEL = 7
/** 每日任务里回顾旧词的比例：约八成新词、两成回顾 */
const REVIEW_RATIO = 0.2
/** 回顾候选窗口：最近几天学过、且今天没排到的词可以被抽中复习 */
const REVIEW_WINDOW_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 是否学过：等级或复习时间有值即视为学过 */
function hasStudied(p) {
  return !!p && ((p.learnLevel || 0) > 0 || (p.nextReview || 0) > 0)
}

/**
 * 上次学习时间。老数据没有 lastSeenAt，用「下次复习 - 当前间隔」反推，
 * 再退化为 lastLevelDate 当天中午。
 */
function lastSeenAtOf(p) {
  if (!p) return 0
  if (p.lastSeenAt) return p.lastSeenAt
  const next = p.nextReview || 0
  if (next > 0) {
    const level = p.learnLevel || 0
    return next - (level > 0 ? intervalMs(level) : 5 * 60 * 1000)
  }
  if (p.lastLevelDate) return new Date(`${p.lastLevelDate}T12:00:00`).getTime()
  return 0
}

/** 把回顾词均匀穿插进新词里，避免全部堆在开头 */
function mixTask(newIds, reviewIds, size) {
  if (!reviewIds.length) return newIds.slice(0, size)
  const total = Math.min(size, newIds.length + reviewIds.length)
  const arr = newIds.slice()
  const step = reviewIds.length + 1
  reviewIds.forEach((id, i) => {
    const target = Math.floor(((i + 1) * total) / step)
    arr.splice(Math.min(target, arr.length), 0, id)
  })
  return arr.slice(0, total)
}

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
    const now = Date.now()
    let level = item.learnLevel || 0
    if (item.lastLevelDate !== date) level = Math.min(level + 1, MAX_LEVEL)
    saveProgress(id, {
      learnLevel: level,
      nextReview: now + intervalMs(level),
      lastLevelDate: date,
      lastSeenAt: now
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
    saveProgress(id, { learnLevel: level, nextReview: Date.now() + 30 * 60 * 1000, lastSeenAt: Date.now() })
    trackStudy(id)
    refreshToday()
    syncWordItem(id)
  }

  /** 不认识：等级归零、5 分钟后重新出现，计入错题本 */
  function markWrong(id) {
    addWrong(id)
    saveProgress(id, { learnLevel: 0, nextReview: Date.now() + 5 * 60 * 1000, lastSeenAt: Date.now() })
    trackStudy(id)
    refreshToday()
    syncWordItem(id)
  }

  /**
   * 生成/读取今天的任务：约八成全新单词 + 两成前几天的回顾词，回顾词均匀穿插。
   * 已经掌握且没到复习时间的词不再占今天的名额，保证第二天是「一批新词」。
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
    const todayStart = startOfToday()
    const recentFrom = todayStart - REVIEW_WINDOW_DAYS * DAY_MS
    const size = dailySize.value
    const fresh = []
    const due = []
    const recent = []
    const known = []
    for (const w of rawWords.value) {
      const p = progress[w.id]
      if (!hasStudied(p)) { fresh.push(w); continue }
      const seen = lastSeenAtOf(p)
      known.push({ w, seen, next: p.nextReview || 0 })
      if (p.nextReview > 0 && p.nextReview <= now) {
        due.push({ w, next: p.nextReview })
      } else if (seen >= recentFrom && seen < todayStart) {
        recent.push({ w, seen })
      }
    }
    due.sort((a, b) => a.next - b.next)
    recent.sort((a, b) => a.seen - b.seen)

    const ids = []
    const picked = new Set()
    const reviewTarget = size >= 10 ? Math.min(size - 1, Math.round(size * REVIEW_RATIO)) : 0
    const reviewIds = []
    for (const { w } of [...due, ...recent]) {
      if (reviewIds.length >= reviewTarget) break
      if (picked.has(w.id)) continue
      picked.add(w.id)
      reviewIds.push(w.id)
    }
    const push = (w) => {
      if (ids.length >= size) return
      if (picked.has(w.id)) return
      picked.add(w.id)
      ids.push(w.id)
    }
    // 主体是新词，按词库顺序取
    for (const w of fresh) {
      if (ids.length + reviewIds.length >= size) break
      push(w)
    }
    // 新词不够时，用剩下的到期词和近期学过的词补齐
    for (const { w } of [...due, ...recent]) {
      if (ids.length + reviewIds.length >= size) break
      push(w)
    }
    // 再不够就按下次复习时间升序用其它学过的词补
    known.sort((a, b) => a.next - b.next)
    for (const { w } of known) {
      if (ids.length + reviewIds.length >= size) break
      push(w)
    }
    const mixed = mixTask(ids, reviewIds, size)
    const next = { date, ids: mixed, size, bookId: book, reviewIds }
    saveTask(book, next)
    // 两个标签页同时生成时，以后写入的那个为准：两边都回读一次，保证拿到的是同一份任务
    task.value = getTasks()[book] || next
    return task.value
  }

  /**
   * 别的标签页改了本学生的数据后，把内存快照对齐到 localStorage。
   * 今日任务以后写入的为准（可能与本地正在背的队列不同，队列不动，避免打断当前一轮）。
   */
  function syncFromStorage() {
    if (loadedBookId.value) applyProgress()
    refreshToday()
    const book = task.value?.bookId || loadedBookId.value
    if (book) {
      const cached = getTasks()[book]
      task.value = cached && cached.date === todayStr() ? cached : null
    }
    const latest = getSettings()
    dailySize.value = latest.dailySize
    shuffleMode.value = latest.shuffle
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
    dailySize, shuffleMode, task, taskWords, taskSize, taskDoneCount, studiedIds,
    reviewCount, wrongWordList,
    loadWords, addWord, batchAddWords, deleteWord,
    markRight, markHard, markWrong,
    ensureDailyTask, regenerateTask, syncFromStorage, setDailySize, setShuffle,
    initStudyQueue, nextWord, handleRight, handleWrong
  }
})
