<template>
  <div class="study-page">
    <!-- 当前学生 + 今日任务 -->
    <div class="student-bar">
      <div class="student-info">
        <span class="student-label">学生：</span>
        <strong class="student-name">{{ studentStore.currentName }}</strong>
        <el-tag size="small" type="info">今日任务 {{ wordStore.taskDoneCount }}/{{ wordStore.taskSize }} 词</el-tag>
        <el-tag v-if="wordStore.shuffleMode" size="small" type="warning">乱序</el-tag>
      </div>
      <el-button size="small" text @click="router.push('/students')">切换学生</el-button>
    </div>

    <!-- 模式选择 -->
    <div class="mode-selector">
      <el-radio-group v-model="studyMode" size="small">
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

    <!-- 每日任务设置：三种模式共用同一批词 -->
    <el-card class="task-settings" shadow="never">
      <div class="task-row">
        <div class="task-item">
          <span class="task-label">每日任务量</span>
          <el-input-number
            :model-value="wordStore.dailySize"
            :min="5"
            :max="100"
            :step="1"
            size="small"
            @change="applyDailySize"
          />
          <span class="task-unit">词</span>
        </div>
        <div class="task-item">
          <span class="task-label">乱序抽查</span>
          <el-switch :model-value="wordStore.shuffleMode" size="small" @change="toggleShuffle" />
        </div>
        <el-button size="small" @click="regenerate">重新生成今日任务</el-button>
      </div>
      <p class="task-tip">
        翻卡背记、选择、拼写使用的是同一批任务单词、同一个顺序；开启乱序后当天顺序固定，三种模式仍然对得上。
      </p>
    </el-card>

    <!-- 翻卡模式 -->
    <FlashcardMode
      v-if="studyMode === 'flashcard' && bookStore.currentBookId"
      :key="'flashcard-' + bookStore.currentBookId + '-' + taskKey"
      :book-id="bookStore.currentBookId"
    />

    <!-- 选择题模式 -->
    <QuizMode
      v-if="studyMode === 'quiz' && bookStore.currentBookId"
      :key="'quiz-' + bookStore.currentBookId + '-' + taskKey"
      :book-id="bookStore.currentBookId"
      @done="studyMode = 'flashcard'"
    />

    <!-- 拼写模式 -->
    <SpellingMode
      v-if="studyMode === 'spelling' && bookStore.currentBookId"
      :key="'spelling-' + bookStore.currentBookId + '-' + taskKey"
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
import { useRouter } from 'vue-router'
import { useBookStore } from '../stores/bookStore'
import { useWordStore } from '../stores/wordStore'
import { useStudentStore } from '../stores/studentStore'
import FlashcardMode from '../components/FlashcardMode.vue'
import QuizMode from '../components/QuizMode.vue'
import SpellingMode from '../components/SpellingMode.vue'

const router = useRouter()
const bookStore = useBookStore()
const wordStore = useWordStore()
const studentStore = useStudentStore()
const studyMode = ref('flashcard')
const showBookSelector = ref(false)
const tempBookId = ref('')
// 任务变化时让三个模式组件重新挂载，立刻读到新的任务
const taskKey = ref(0)

onMounted(async () => {
  if (!bookStore.bookList.length) await bookStore.loadBooks()
  if (!bookStore.currentBookId && bookStore.bookList.length) {
    bookStore.selectBook(bookStore.bookList[0].id)
  }
  if (bookStore.currentBookId) {
    await wordStore.loadWords(bookStore.currentBookId)
    wordStore.ensureDailyTask(bookStore.currentBookId)
  }
  tempBookId.value = bookStore.currentBookId
})

function applyDailySize(size) {
  wordStore.setDailySize(size)
  wordStore.regenerateTask(bookStore.currentBookId)
  taskKey.value++
}

function toggleShuffle(value) {
  wordStore.setShuffle(value)
  taskKey.value++
}

function regenerate() {
  wordStore.regenerateTask(bookStore.currentBookId)
  taskKey.value++
}

async function confirmBook() {
  if (tempBookId.value) {
    bookStore.selectBook(tempBookId.value)
    await wordStore.loadWords(tempBookId.value)
    wordStore.ensureDailyTask(tempBookId.value)
    taskKey.value++
  }
  showBookSelector.value = false
}
</script>

<style scoped>
.study-page {
  max-width: 600px;
  margin: 0 auto;
}
.student-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px 14px;
  background: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.student-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.student-label {
  font-size: 13px;
  color: var(--color-text-muted);
}
.student-name {
  font-size: 15px;
  color: var(--color-primary);
}
.mode-selector {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}
.task-settings {
  margin-bottom: 16px;
}
.task-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.task-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.task-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}
.task-unit {
  font-size: 13px;
  color: var(--color-text-muted);
}
.task-tip {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-muted);
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
  .task-row {
    gap: 12px;
  }
}
</style>
