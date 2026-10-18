<template>
  <el-aside width="200px" class="app-sidebar">
    <div class="sidebar-header" @click="onTitleClick">
      <span class="logo-icon">📖</span>
      <span class="app-title">单词复习</span>
    </div>

    <!-- 学生切换器（一个学生一份记录） -->
    <div class="student-switcher">
      <el-select
        :model-value="studentStore.currentId"
        size="small"
        @change="switchStudent"
        fit-input-width
      >
        <el-option
          v-for="s in studentStore.students"
          :key="s.id"
          :label="s.name"
          :value="s.id"
        />
      </el-select>
    </div>

    <!-- 词本切换器（所有人可见） -->
    <div class="book-switcher">
      <el-select
        v-model="selectedBookId"
        placeholder="选择词本"
        size="small"
        @change="switchBook"
        :loading="bookStore.loading"
        fit-input-width
      >
        <el-option
          v-for="book in bookStore.bookList"
          :key="book.id"
          :label="book.name + ' (' + bookStore.getWordCount(book.id) + '词)'"
          :value="book.id"
        />
      </el-select>
    </div>

    <el-menu
      :default-active="currentRoute"
      mode="vertical"
      class="sidebar-menu"
      @select="handleSelect"
    >
      <el-menu-item
        v-for="item in visibleMenu"
        :key="item.path"
        :index="item.path"
      >
        <el-icon>
          <component :is="item.icon" />
        </el-icon>
        <span>{{ item.title }}</span>
      </el-menu-item>
    </el-menu>

    <div class="sidebar-footer">
      <span class="version-text">v2.0</span>
      <span v-if="auth.isAdmin" class="admin-badge" @click="auth.disableAdmin">管理员</span>
    </div>
  </el-aside>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useBookStore } from '../stores/bookStore'
import { useWordStore } from '../stores/wordStore'
import { useStudentStore } from '../stores/studentStore'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const bookStore = useBookStore()
const wordStore = useWordStore()
const studentStore = useStudentStore()
const currentRoute = computed(() => route.path)

const selectedBookId = ref(null)

const tapCount = ref(0)
let tapTimer = null

onMounted(async () => {
  if (!bookStore.bookList.length) await bookStore.loadBooks()
  selectedBookId.value = bookStore.currentBookId
})

watch(() => bookStore.currentBookId, (id) => {
  selectedBookId.value = id
})

async function switchBook(id) {
  if (id === bookStore.currentBookId) return
  // 保存当前词本词数
  if (wordStore.wordList.length > 0) {
    bookStore.updateWordCount(bookStore.currentBookId, wordStore.wordList.length, true)
  }
  bookStore.selectBook(id)
  await wordStore.loadWords(id)
}

function switchStudent(id) {
  studentStore.switchStudent(id)
}

function onTitleClick() {
  tapCount.value++
  clearTimeout(tapTimer)
  tapTimer = setTimeout(() => { tapCount.value = 0 }, 800)
  if (tapCount.value >= 5) { auth.enableAdmin(); tapCount.value = 0 }
}

const allMenuItems = [
  { path: '/', title: '首页', icon: 'House' },
  { path: '/students', title: '学生档案', icon: 'User' },
  { path: '/books', title: '单词管理', icon: 'DocumentAdd', admin: true },
  { path: '/study', title: '开始背诵', icon: 'Reading' },
  { path: '/wrong', title: '错题本', icon: 'Warning' },
  { path: '/stats', title: '学习统计', icon: 'DataAnalysis' }
]

const visibleMenu = computed(() =>
  auth.isAdmin ? allMenuItems : allMenuItems.filter(m => !m.admin)
)

function handleSelect(index) {
  if (index !== route.path) router.push(index)
}
</script>

<style scoped>
.app-sidebar {
  background: white;
  border-right: 1px solid var(--color-border);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sidebar-header {
  padding: 20px 20px 12px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.logo-icon { font-size: 22px; }
.app-title { font-size: 17px; font-weight: 700; color: var(--color-text); }

/* 学生切换器 */
.student-switcher {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
}
.student-switcher .el-select { width: 100%; }

/* 词本切换器 */
.book-switcher {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
}
.book-switcher .el-select { width: 100%; }

.sidebar-menu { flex: 1; padding: 8px 0; border-right: none; }
.sidebar-menu .el-menu-item {
  margin: 2px 8px;
  border-radius: var(--radius-md);
  font-size: 14px;
  transition: all var(--transition-fast);
}
.sidebar-menu .el-menu-item:hover { background: #F1F5F9; }
.sidebar-menu .el-menu-item.is-active {
  color: var(--color-primary) !important;
  background: rgba(74, 108, 247, 0.08) !important;
  font-weight: 500;
}
.sidebar-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
  text-align: center;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.version-text { font-size: 11px; color: var(--color-text-muted); }
.admin-badge {
  font-size: 10px;
  color: var(--color-primary);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(74,108,247,0.08);
}
.admin-badge:hover { background: rgba(74,108,247,0.15); }
</style>
