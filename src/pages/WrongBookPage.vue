<template>
  <div class="wrong-page">
    <el-card class="wrong-card">
      <template #header>
        <div class="wrong-header">
          <span>
            <el-icon style="vertical-align: middle; margin-right: 6px;"><Warning /></el-icon>
            错题本
          </span>
          <el-tag v-if="wordStore.wrongWordList.length" type="danger" effect="plain">
            {{ wordStore.wrongWordList.length }} 个待复习
          </el-tag>
        </div>
      </template>

      <el-table
        v-if="wordStore.wrongWordList.length"
        :data="wordStore.wrongWordList"
        border
        stripe
        size="small"
        max-height="460"
      >
        <el-table-column prop="word" label="单词" width="140">
          <template #default="{ row }">
            <strong>{{ row.word }}</strong>
          </template>
        </el-table-column>
        <el-table-column prop="phonetic" label="音标" width="140" />
        <el-table-column prop="mean" label="释义" min-width="200" />
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-button size="small" circle @click="speakWord(row.word)">
              <el-icon><Microphone /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无错题，继续加油！">
        <el-button type="primary" @click="router.push('/study')">开始学习</el-button>
      </el-empty>
    </el-card>

    <!-- 快速复习入口 -->
    <el-card v-if="wordStore.wrongWordList.length" class="quick-review-card">
      <div class="quick-review-content">
        <div>
          <strong>复习建议</strong>
          <p class="review-tip">
            错题包含 {{ wordStore.wrongWordList.length }} 个单词，
            建议优先复习这些容易遗忘的词。
          </p>
        </div>
        <el-button type="primary" @click="reviewWrong">开始复习</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useWordStore } from '../stores/wordStore'
import { useSpeech } from '../composables/useSpeech'

const router = useRouter()
const wordStore = useWordStore()
const { speak } = useSpeech()

function speakWord(text) { speak(text) }

function reviewWrong() {
  wordStore.studyFilter = 'wrong'
  router.push('/study')
}
</script>

<style scoped>
.wrong-page {
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}
.wrong-card {
  margin-bottom: 16px;
}
.wrong-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.quick-review-card {
  cursor: default;
}
.quick-review-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.review-tip {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}
</style>
