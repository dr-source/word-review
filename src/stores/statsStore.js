import { defineStore } from 'pinia'
import { computed } from 'vue'
import { Storage, DB_KEYS } from '../utils/storage'
import { useWordStore } from './wordStore'

export const useStatsStore = defineStore('stats', () => {
  const wordStore = useWordStore()

  const totalWords = computed(() => {
    const all = Storage.get(DB_KEYS.WORD_DATA) || []
    return all.length
  })

  const learnedWords = computed(() => {
    const all = Storage.get(DB_KEYS.WORD_DATA) || []
    return all.filter(w => w.learnLevel > 0).length
  })

  const wrongWordsCount = computed(() => {
    const wrong = Storage.get(DB_KEYS.WRONG_WORDS) || []
    return wrong.length
  })

  const masteryRate = computed(() => {
    if (!totalWords.value) return 0
    return Math.round((learnedWords.value / totalWords.value) * 100)
  })

  /** 掌握度分布：每个 learnLevel 有多少词 */
  const levelDistribution = computed(() => {
    const all = Storage.get(DB_KEYS.WORD_DATA) || []
    const dist = Array.from({ length: 8 }, () => 0)
    all.forEach(w => {
      const level = Math.min(w.learnLevel || 0, 7)
      dist[level]++
    })
    return dist
  })

  /** 连续学习天数 */
  const streakDays = computed(() => {
    const record = Storage.get(DB_KEYS.LEARN_RECORD) || {}
    const dates = Object.keys(record).sort((a, b) => b.localeCompare(a))
    if (!dates.length) return 0
    let streak = 1
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const todayStr = today.toISOString().slice(0, 10)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    // 今天或昨天有记录才算 streak 开始
    if (dates[0] !== todayStr && dates[0] !== yesterdayStr) return 0
    for (let i = 1; i < dates.length; i++) {
      const curr = new Date(dates[i - 1])
      const prev = new Date(dates[i])
      const diff = (curr - prev) / (1000 * 60 * 60 * 24)
      if (diff === 1) streak++
      else break
    }
    return streak
  })

  /** 今日学习数 */
  const todayLearned = computed(() => {
    const record = Storage.get(DB_KEYS.LEARN_RECORD) || {}
    const today = new Date().toISOString().slice(0, 10)
    return record[today] || 0
  })

  return {
    totalWords, learnedWords, wrongWordsCount, masteryRate,
    levelDistribution, streakDays, todayLearned
  }
})
