<template>
  <div class="daily-words-page">
    <div class="page-head">
      <div class="head-text">
        <h2 class="page-title">今日单词表</h2>
        <p class="page-sub">
          {{ today }} · 共 {{ rows.length }} 词（每天 {{ wordStore.dailySize }} 词，可在「开始背诵」里调整）
        </p>
      </div>
      <div class="head-actions">
        <el-button size="small" class="go-study" @click="router.push('/study')">去背记</el-button>
        <el-button size="small" type="primary" class="go-exam" @click="router.push('/exam')">100 词测试卷</el-button>
      </div>
    </div>

    <div class="table-wrap">
      <el-table
        :data="rows"
        stripe
        border
        size="small"
        style="width: 100%"
        empty-text="今天还没有单词，先到「开始背诵」生成任务"
      >
        <el-table-column type="index" label="#" width="52" align="center" />
        <el-table-column label="单词" min-width="130">
          <template #default="{ row }">
            <div class="cell-word-row">
              <span class="cell-word">{{ row.word }}</span>
              <el-tag v-if="row.review" size="small" type="warning">回顾</el-tag>
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
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBookStore } from '../stores/bookStore'
import { useWordStore } from '../stores/wordStore'
import { useSpeech } from '../composables/useSpeech'
import { syllableLine, splitSyllables } from '../utils/syllable'
import { sentenceFor } from '../utils/sentences'
import { todayStr } from '../utils/profile'

const router = useRouter()
const bookStore = useBookStore()
const wordStore = useWordStore()
const { speak } = useSpeech()

const today = todayStr()

const rows = computed(() => {
  const reviewIds = wordStore.task?.reviewIds || []
  return wordStore.taskWords.map(w => ({
    id: w.id,
    word: w.word,
    phonetic: w.phonetic || '',
    mean: w.mean || '',
    // 没有例句就是空，翻卡/完形按句子的方式统一兜底
    sentence: w.sentence || sentenceFor(w.word) || '',
    // 一个音节就不用切开，免得看着像没切
    syllable: splitSyllables(w.phonetic).length > 1 ? syllableLine(w.phonetic) : '',
    review: reviewIds.includes(w.id)
  }))
})

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
.table-wrap {
  background: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 4px;
  overflow-x: auto;
}
.cell-word-row { display: flex; align-items: center; gap: 6px; }
.cell-word { font-size: 15px; font-weight: 700; color: var(--color-text); }
.cell-sentence { font-size: 12px; color: var(--color-text-secondary); font-style: italic; line-height: 1.5; }
.cell-speak { font-size: 16px; }
@media (max-width: 640px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .head-actions { justify-content: flex-end; }
}
</style>
