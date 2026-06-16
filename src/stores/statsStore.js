import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '../utils/supabase'
import { Storage, DB_KEYS } from '../utils/storage'

export const useStatsStore = defineStore('stats', () => {
  const totalWords = ref(0)
  const levelData = ref([]) // 8 levels

  async function loadStats(bookId) {
    if (!supabase) return
    // 全部单词统计（需要显式请求 count）
    let query = supabase.from('words').select('id', { count: 'exact', head: true })
    if (bookId) query = query.eq('book_id', bookId)
    const { count } = await query
    totalWords.value = count || 0

    // 单词等级分布（从个人进度 localStorage 读取）
    const { data: allWords } = await supabase.from('words').select('id, book_id')
    const dist = Array.from({ length: 8 }, () => 0)
    // 等级分布存在 localStorage（个人进度）
    const progress = JSON.parse(localStorage.getItem('word_personal_progress') || '{}')
    const counted = new Set()
    for (const w of allWords || []) {
      if (counted.has(w.id)) continue
      counted.add(w.id)
      const p = progress[w.id]
      const level = p ? Math.min(p.learnLevel || 0, 7) : 0
      dist[level]++
    }
    levelData.value = dist
  }

  const learnedWords = computed(() => {
    // learnLevel > 0 的算已掌握
    return levelData.value.slice(1).reduce((a, b) => a + b, 0)
  })

  const wrongWordsCount = computed(() => {
    const wrong = Storage.get(DB_KEYS.WRONG_WORDS) || []
    return wrong.length
  })

  const masteryRate = computed(() => {
    if (!totalWords.value) return 0
    return Math.round((learnedWords.value / totalWords.value) * 100)
  })

  const levelDistribution = computed(() => levelData.value)

  const streakDays = computed(() => {
    const record = Storage.get(DB_KEYS.LEARN_RECORD) || {}
    const dates = Object.keys(record).sort((a, b) => b.localeCompare(a))
    if (!dates.length) return 0
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    if (dates[0] !== today && dates[0] !== yesterday) return 0
    let streak = 1
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i - 1]) - new Date(dates[i])) / 86400000
      if (diff === 1) streak++
      else break
    }
    return streak
  })

  const todayLearned = computed(() => {
    const record = Storage.get(DB_KEYS.LEARN_RECORD) || {}
    const today = new Date().toISOString().slice(0, 10)
    return record[today] || 0
  })

  return { totalWords, learnedWords, wrongWordsCount, masteryRate,
    levelDistribution, streakDays, todayLearned,
    loadStats }
})
