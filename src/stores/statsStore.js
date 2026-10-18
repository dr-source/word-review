import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '../utils/supabase'
import { LocalStore } from '../utils/localStore'
import {
  currentStudent, getProgress, getWrongIds, getWrongCounts, getRecords,
  getTasks, getTodayStudiedIds, getSettings, calcStreak, todayStr
} from '../utils/profile'

const LEVEL_COUNT = 8

export const useStatsStore = defineStore('stats', () => {
  const totalWords = ref(0)
  const levelData = ref(Array.from({ length: LEVEL_COUNT }, () => 0)) // 8 个记忆等级
  const currentWords = ref([]) // 当前词本的 { id, word, mean }
  const loadedBookId = ref(null)
  // localStorage 不是响应式的，每次 loadStats 递增一次，让下面的统计值重新计算
  const version = ref(0)

  const studentName = computed(() => currentStudent()?.name || '未选择学生')

  async function loadStats(bookId) {
    loadedBookId.value = bookId || null
    let rows = []
    if (!supabase) {
      rows = bookId ? LocalStore.loadWords(bookId) : LocalStore.loadAllWords()
    } else {
      let query = supabase.from('words').select('id, word, mean, book_id')
      if (bookId) query = query.eq('book_id', bookId)
      const { data } = await query
      rows = data || []
    }
    currentWords.value = rows.map(w => ({ id: w.id, word: w.word, mean: w.mean || '' }))
    totalWords.value = currentWords.value.length

    // 等级分布只统计当前词本（按当前学生的进度）
    const progress = getProgress()
    const dist = Array.from({ length: LEVEL_COUNT }, () => 0)
    for (const w of currentWords.value) {
      const level = Math.min(progress[w.id]?.learnLevel || 0, LEVEL_COUNT - 1)
      dist[level]++
    }
    levelData.value = dist
    version.value++
  }

  const learnedWords = computed(() => levelData.value.slice(1).reduce((a, b) => a + b, 0))

  const wrongWordsCount = computed(() => {
    version.value
    return getWrongIds().length
  })

  const masteryRate = computed(() => {
    if (!totalWords.value) return 0
    return Math.round((learnedWords.value / totalWords.value) * 100)
  })

  const levelDistribution = computed(() => levelData.value)

  const streakDays = computed(() => {
    version.value
    return calcStreak(getRecords())
  })

  const todayLearned = computed(() => {
    version.value
    return getRecords()[todayStr()] || 0
  })

  /** 今天学过的去重词数 */
  const todayUnique = computed(() => {
    version.value
    return getTodayStudiedIds().length
  })

  /** 今日任务进度（按当前词本） */
  const taskSize = computed(() => {
    version.value
    const task = getTasks()[loadedBookId.value]
    return task?.date === todayStr() ? task.ids.length : 0
  })

  const taskDoneRate = computed(() => {
    version.value
    if (!taskSize.value) return 0
    const ids = new Set(getTasks()[loadedBookId.value].ids)
    const done = getTodayStudiedIds().filter(id => ids.has(id)).length
    return Math.round((done / taskSize.value) * 100)
  })

  /** 词本里还没开始的新词数，用来估算“还要背几天” */
  const newRemaining = computed(() => levelData.value[0] || 0)

  /** 高频错词（按错误次数排序，取前 5） */
  const topWrongWords = computed(() => {
    version.value
    const counts = getWrongCounts()
    const map = new Map(currentWords.value.map(w => [w.id, w]))
    return getWrongIds()
      .map(id => ({
        id,
        word: map.get(id)?.word || '',
        mean: map.get(id)?.mean || '',
        count: counts[id]?.count || 1,
        lastAt: counts[id]?.lastAt || 0
      }))
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
      .slice(0, 5)
  })

  /** 每个学生一份的个性化学习分析 */
  const analysisReport = computed(() => {
    const name = studentName.value
    const lines = []
    if (!totalWords.value) {
      lines.push(`${name} 当前还没有可统计的单词，先在「单词管理」里选择或添加词本。`)
      return lines
    }
    lines.push(`学生 ${name} 当前词本共 ${totalWords.value} 词，已掌握 ${learnedWords.value} 词，掌握率 ${masteryRate.value}%。`)

    if (todayUnique.value === 0) {
      lines.push(`今天还没有开始学习，建议先完成今日任务（${taskSize.value || getSettings().dailySize} 词）。`)
    } else if (taskDoneRate.value >= 100) {
      lines.push(`今天的 ${taskSize.value} 词任务已全部完成，可以再做一轮拼写模式巩固当天内容。`)
    } else {
      lines.push(`今天已学 ${todayUnique.value} 词，今日任务完成 ${taskDoneRate.value}%（${todayUnique.value}/${taskSize.value || '—'}）。`)
    }

    const daily = getSettings().dailySize
    if (newRemaining.value > 0) {
      lines.push(`词本里还有 ${newRemaining.value} 个新词没开始，按每天 ${daily} 词的节奏，大约 ${Math.ceil(newRemaining.value / daily)} 天能过完一遍。`)
    } else {
      lines.push('词本里的单词都至少背过一轮了，接下来靠滚动复习把等级推到 Lv.5 以上就是真正掌握。')
    }

    const top = topWrongWords.value[0]
    if (wrongWordsCount.value) {
      lines.push(`错题本里有 ${wrongWordsCount.value} 词待巩固${top && top.word ? `，错得最多的是 ${top.word}（${top.count} 次）` : ''}，建议先用「错题本 → 开始复习」过一遍。`)
    } else {
      lines.push('错题本目前是空的，说明最近一轮的正确率不错。')
    }

    const beginner = levelData.value[1] + levelData.value[2]
    if (beginner > 0) {
      lines.push(`有 ${beginner} 词停在 Lv.1-2（刚起步），它们还会按 1/2/4 天的间隔反复出现，答对一次升一级。`)
    }
    if (levelData.value[5] + levelData.value[6] + levelData.value[7] > 0) {
      lines.push(`已有 ${levelData.value[5] + levelData.value[6] + levelData.value[7]} 词进入 Lv.5 以上，下次复习间隔拉长到 15～60 天。`)
    }

    if (streakDays.value >= 7) lines.push(`已经连续学习 ${streakDays.value} 天，保持这个节奏就很稳。`)
    else if (streakDays.value > 0) lines.push(`连续学习 ${streakDays.value} 天，坚持到 7 天开始会有明显感觉。`)
    else lines.push('还没有连续学习记录，建议每天固定时间完成一次任务。')

    return lines
  })

  return {
    totalWords, learnedWords, wrongWordsCount, masteryRate,
    levelDistribution, streakDays, todayLearned,
    todayUnique, taskSize, taskDoneRate, newRemaining,
    topWrongWords, analysisReport, studentName, loadedBookId,
    loadStats
  }
})
