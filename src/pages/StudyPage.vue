<template>
  <div class="study-page">
    <!-- 模式选择 -->
    <div class="mode-selector">
      <el-radio-group v-model="studyMode" size="small" @change="onModeChange">
        <el-radio-button value="flashcard">📇 翻卡</el-radio-button>
        <el-radio-button value="quiz">📝 选择</el-radio-button>
        <el-radio-button value="spelling">✏️ 拼写</el-radio-button>
      </el-radio-group>

      <el-button
        v-if="bookStore.bookList.length > 0"
        size="small"
        text
        @click="showBookSelector = true"
      >
        📚 {{ bookStore.currentBook.name || '选择词本' }}
      </el-button>
    </div>

    <!-- 翻卡模式 -->
    <FlashcardMode
      v-if="studyMode === 'flashcard' && bookStore.currentBookId"
      :key="'flashcard-' + bookStore.currentBookId"
      :book-id="bookStore.currentBookId"
    />

    <!-- 选择题模式 -->
    <QuizMode
      v-if="studyMode === 'quiz' && bookStore.currentBookId"
      :key="'quiz-' + bookStore.currentBookId"
      :book-id="bookStore.currentBookId"
      @done="studyMode = 'flashcard'"
    />

    <!-- 拼写模式 -->
    <SpellingMode
      v-if="studyMode === 'spelling' && bookStore.currentBookId"
      :key="'spelling-' + bookStore.currentBookId"
      :book-id="bookStore.currentBookId"
      @done="studyMode = 'flashcard'"
    />

    <el-empty v-if="!bookStore.currentBookId" description="请先选择词本">
      <el-button type="primary" @click="showBookSelector = true">选择词本</el-button>
    </el-empty>

    <!-- 词本选择弹窗 -->
    <el-dialog v-model="showBookSelector" title="选择词本" width="320px">
      <el-radio-group v-model="tempBookId" direction="vertical" style="width:100%;">
        <el-radio
          v-for="book in bookStore.bookList"
          :key="book.id"
          :value="book.id"
          style="margin-bottom:8px;"
        >
          {{ book.name }}
        </el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="showBookSelector = false">取消</el-button>
        <el-button type="primary" @click="confirmBook">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useBookStore } from '../stores/bookStore'
import { useWordStore } from '../stores/wordStore'
import FlashcardMode from '../components/FlashcardMode.vue'
import QuizMode from '../components/QuizMode.vue'
import SpellingMode from '../components/SpellingMode.vue'

const bookStore = useBookStore()
const wordStore = useWordStore()
const studyMode = ref('flashcard')
const showBookSelector = ref(false)
const tempBookId = ref('')

onMounted(() => {
  if (!bookStore.bookList.length) bookStore.loadBooks()
  if (!bookStore.currentBookId && bookStore.bookList.length) {
    bookStore.selectBook(bookStore.bookList[0].id)
  }
  tempBookId.value = bookStore.currentBookId
})

function onModeChange() {
  // 模式切换时自动触发 key 变化重新挂载组件
}

function confirmBook() {
  if (tempBookId.value) {
    bookStore.selectBook(tempBookId.value)
    wordStore.loadWords(tempBookId.value)
  }
  showBookSelector.value = false
}
</script>

<style scoped>
.study-page {
  max-width: 600px;
  margin: 0 auto;
}
.mode-selector {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 640px) {
  .mode-selector {
    flex-direction: column;
    align-items: stretch;
  }
  .mode-selector .el-radio-group {
    display: flex;
    width: 100%;
  }
  .mode-selector .el-radio-button {
    flex: 1;
  }
}
</style>
