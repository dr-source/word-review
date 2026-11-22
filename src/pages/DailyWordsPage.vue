<template>
  <div class="daily-words-page">
    <div class="page-head">
      <div class="head-text">
        <h2 class="page-title">今日单词表</h2>
        <p class="page-sub">
          {{ today }} · {{ viewSub }}
        </p>
      </div>
      <div class="head-actions">
        <el-button size="small" class="go-study" @click="router.push('/study')">去背记</el-button>
        <el-button size="small" type="primary" class="go-exam" @click="router.push('/exam')">100 词测试卷</el-button>
      </div>
    </div>

    <div v-if="unitTabs.length > 1" class="unit-tabs">
      <button
        v-for="t in unitTabs"
        :key="t.key"
        type="button"
        class="unit-tab"
        :class="{ active: activeUnit === t.key }"
        :data-unit="t.key"
        @click="activeUnit = t.key"
      >
        <span class="unit-tab-name">{{ t.label }}</span>
        <span class="unit-tab-count">{{ t.count }}</span>
      </button>
    </div>

    <div class="table-wrap">
      <template v-if="visibleGroups.length">
        <div v-for="g in visibleGroups" :key="g.key" class="unit-block">
          <div class="unit-head">
            <span class="unit-title">{{ g.label }}</span>
            <span class="unit-count">{{ g.rows.length }} 词</span>
          </div>
          <el-table
            :data="g.rows"
            stripe
            border
            size="small"
            style="width: 100%"
          >
            <el-table-column type="index" label="#" width="52" align="center" />
            <el-table-column label="单词" min-width="130">
              <template #default="{ row }">
                <div class="cell-word-row">
                  <span class="cell-word">{{ row.word }}</span>
                  <el-tag v-if="row.today && activeUnit !== 'today'" size="small" class="tag-today">今日</el-tag>
                  <el-tag v-if="row.review" size="small" type="warning">回顾</el-tag>
                  <el-tag v-if="row.wrong" size="small" type="danger" class="tag-wrong">错词复现</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="音标" min-width="130">
              <template #default="{ row }">{{ row.phonetic || '—' }}</template>
            </el-table-column>
            <el-table-column label="音节" min-width="130">
              <template #default="{ row }">{{ row.syllable || '—' }}</template>
            </el-table-column>
            <el-table-column label="词性 · 释义" min-width="230">
              <template #default="{ row }">{{ row.mean }}</template>
            </el-table-column>
            <el-table-column label="例句" min-width="240">
              <template #default="{ row }">
                <span class="cell-sentence">{{ row.sentence || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="发音" width="70" align="center">
              <template #default="{ row }">
                <el-button size="small" text class="cell-speak" @click="speak(row.word)">🔊</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>
      <el-empty v-else description="今天还没有单词，先到「开始背诵」生成任务" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useBookStore } from '../stores/bookStore'
import { useWordStore } from '../stores/wordStore'
import { useSpeech } from '../composables/useSpeech'
import { syllableLine, splitSyllables } from '../utils/syllable'
import { sentenceFor } from '../utils/sentences'
import { todayStr } from '../utils/profile'
import { groupByUnit, pickUnitGroup } from '../utils/units'

const router = useRouter()
const bookStore = useBookStore()
const wordStore = useWordStore()
const { speak } = useSpeech()

const today = todayStr()

const taskIds = computed(() => new Set(wordStore.task?.ids || []))
const reviewIds = computed(() => new Set(wordStore.task?.reviewIds || []))

/** 一条表行：今日任务和整本列表共用同一种形状，标签靠 today/review/wrong 区分 */
function buildRow(w) {
  return {
    id: w.id,
    word: w.word,
    phonetic: w.phonetic || '',
    mean: w.mean || '',
    // 没有例句就是空，翻卡/完形按句子的方式统一兜底
    sentence: w.sentence || sentenceFor(w.word) || '',
    // 一个音节就不用切开，免得看着像没切
    syllable: splitSyllables(w.phonetic).length > 1 ? syllableLine(w.phonetic) : '',
    unit: w.unit || '',
    today: taskIds.value.has(w.id),
    review: reviewIds.value.has(w.id),
    wrong: !!w.wrong
  }
}

/** 今天这批词 */
const todayRows = computed(() => wordStore.taskWords.map(buildRow))
/** 整本书的全部词：切到某个单元时能直接看到该单元的所有单词，而不只是今天排到的 */
const bookRows = computed(() => wordStore.wordList.map(buildRow))

/** 按单元分表展示；没有单元号的词本退化成一张「未分单元」表 */
const todayGroups = computed(() => groupByUnit(todayRows.value))
const bookGroups = computed(() => groupByUnit(bookRows.value))

/** 单元切换：'today' 看今天的任务，其余是整本书某个单元，点了就只看那一张表 */
const activeUnit = ref('today')
const unitTabs = computed(() => (
  bookGroups.value.length > 1
    ? [
        { key: 'today', label: '今日任务', count: todayRows.value.length },
        ...bookGroups.value.map(g => ({ key: g.key, label: g.label, count: g.rows.length }))
      ]
    : []
))
const visibleGroups = computed(() => (
  activeUnit.value === 'today'
    ? todayGroups.value
    : pickUnitGroup(bookGroups.value, activeUnit.value)
))

/** 非「今日任务」时，副标题要说明：这是整本书该单元的词，其中几个在今天的任务里 */
const viewSub = computed(() => {
  if (activeUnit.value === 'today' || !visibleGroups.value.length) {
    return `共 ${todayRows.value.length} 词（每天 ${wordStore.dailySize} 词，可在「开始背诵」里调整）`
  }
  const g = visibleGroups.value[0]
  const hit = g.rows.filter(r => r.today).length
  return `${g.label} · ${g.rows.length} 词（整本${hit ? `，其中今天任务含 ${hit} 词` : ''}）`
})

// 换词本后整本书的单元变了，原来选中的单元可能不存在了，退回「今日任务」
watch(bookGroups, list => {
  if (activeUnit.value !== 'today' && !list.some(g => g.key === activeUnit.value)) {
    activeUnit.value = 'today'
  }
})
watch(() => bookStore.currentBookId, () => { activeUnit.value = 'today' })

onMounted(async () => {
  if (!bookStore.bookList.length) await bookStore.loadBooks()
  if (!bookStore.currentBookId && bookStore.bookList.length) {
    bookStore.selectBook(bookStore.bookList[0].id)
  }
  if (bookStore.currentBookId) {
    await wordStore.loadWords(bookStore.currentBookId)
    wordStore.ensureDailyTask(bookStore.currentBookId)
  }
})
</script>

<style scoped>
.daily-words-page { max-width: 1100px; margin: 0 auto; }
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.page-title { font-size: 20px; font-weight: 700; color: var(--color-text); }
.page-sub { margin-top: 4px; font-size: 12px; color: var(--color-text-muted); }
.head-actions { display: flex; gap: 8px; }
.unit-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.unit-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: white;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: color .15s, border-color .15s, background .15s;
}
.unit-tab:hover { border-color: var(--color-primary); color: var(--color-primary); }
.unit-tab.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}
.unit-tab-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
}
.unit-tab.active .unit-tab-count { color: rgba(255, 255, 255, .85); }
.table-wrap {
  background: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 4px;
  overflow-x: auto;
}
.cell-word-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cell-word { font-size: 15px; font-weight: 700; color: var(--color-text); }
.unit-block + .unit-block { margin-top: 14px; }
.unit-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px 6px;
}
.unit-title { font-size: 15px; font-weight: 700; color: var(--color-text); }
.unit-count { font-size: 12px; color: var(--color-text-muted); }
.tag-wrong { margin-left: 0; }
.tag-today {
  border-style: dashed;
}
.cell-sentence { font-size: 12px; color: var(--color-text-secondary); font-style: italic; line-height: 1.5; }
.cell-speak { font-size: 16px; }
@media (max-width: 640px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .head-actions { justify-content: flex-end; }
  .unit-tabs { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }
  .unit-tab { flex: 0 0 auto; }
}
</style>
