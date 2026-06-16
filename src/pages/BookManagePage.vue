<template>
  <el-row>
    <!-- 左侧：词本列表 -->
    <el-col :xs="24" :sm="24" :md="8">
      <el-card header="教材词本">
        <div class="book-header-row">
          <el-input
            v-model="newBookName"
            placeholder="输入教材名称"
            size="small"
            clearable
            @keyup.enter="handleAddBook"
          />
          <el-button type="primary" size="small" @click="handleAddBook" style="margin-top:8px;width:100%">
            新增词本
          </el-button>
        </div>
        <ul class="book-list">
          <li
            v-for="book in bookStore.bookList"
            :key="book.id"
            @click="selectBook(book)"
            :class="{ active: bookStore.currentBookId === book.id }"
          >
            <div class="book-item">
              <span class="book-name">{{ book.name }}</span>
              <span class="book-count">{{ bookStore.getWordCount(book.id) }}词</span>
              <el-popconfirm
                title="删除后词本内所有单词也会被删除，确定吗？"
                @confirm.stop="handleDeleteBook(book)"
                @click.stop
              >
                <template #reference>
                  <el-button
                    size="small"
                    type="danger"
                    text
                    circle
                    @click.stop
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </li>
        </ul>
      </el-card>
    </el-col>

    <!-- 右侧：单词管理 -->
    <el-col :xs="24" :sm="24" :md="16">
      <el-card header="添加单词">
        <el-form :model="addForm" label-width="60px" size="small">
          <el-row>
            <el-col :xs="24" :sm="8">
              <el-form-item label="单词">
                <el-input v-model="addForm.word" placeholder="输入单词" @input="handleWordInput">
                  <template #append>
                    <el-button @click="handleLookup" :disabled="!addForm.word" size="small">
                      查词
                    </el-button>
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="8">
              <el-form-item label="音标">
                <el-input v-model="addForm.phonetic" placeholder="可选" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="8">
              <el-form-item label="释义">
                <el-input v-model="addForm.mean" placeholder="中文释义" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="例句">
            <el-input v-model="addForm.sentence" placeholder="可选" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleAddWord">添加单词</el-button>
            <el-button @click="openImport">批量导入</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 单词列表 -->
      <el-card header="单词列表" style="margin-top:16px;">
        <template #header>
          <div class="word-list-header">
            <span>单词列表（{{ wordStore.wordList.length }}）</span>
            <div class="word-list-actions">
              <el-input
                v-model="searchText"
                placeholder="搜索当前词本..."
                size="small"
                clearable
                prefix-icon="Search"
                class="search-input"
              />
            </div>
          </div>
        </template>
        <div class="table-wrapper">
        <el-table :data="filteredWords" border stripe size="small" max-height="400">
          <el-table-column prop="word" label="单词" width="140" />
          <el-table-column prop="phonetic" label="音标" width="140" />
          <el-table-column prop="mean" label="释义" min-width="160" />
          <el-table-column label="掌握度" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="levelTagType(row.learnLevel)" size="small">
                Lv.{{ row.learnLevel || 0 }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center">
            <template #default="{ row }">
              <el-popconfirm title="确认删除此单词？" @confirm="handleDeleteWord(row.id)">
                <template #reference>
                  <el-button size="small" type="danger" text>删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        </div>
      </el-card>

      <!-- 数据管理 -->
      <el-card style="margin-top:16px;">
        <template #header>数据管理</template>
        <div class="data-actions">
          <el-button @click="exportData" :disabled="!wordStore.wordList.length">
            📤 导出为 JSON
          </el-button>
          <el-upload
            action="#"
            :show-file-list="false"
            :auto-upload="false"
            :on-change="importData"
            accept=".json"
          >
            <el-button>📥 从 JSON 恢复</el-button>
          </el-upload>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <ImportDialog ref="importDialogRef" />
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useBookStore } from '../stores/bookStore'
import { useWordStore } from '../stores/wordStore'
import { lookupWord, dictSize } from '../utils/dictionary'
import { Storage, DB_KEYS } from '../utils/storage'
import ImportDialog from '../components/ImportDialog.vue'

const bookStore = useBookStore()
const wordStore = useWordStore()
const importDialogRef = ref(null)
const newBookName = ref('')
const searchText = ref('')

const addForm = ref({
  word: '', phonetic: '', mean: '', sentence: ''
})
let lookupTimer = null

function handleWordInput(val) {
  if (addForm.value.phonetic || addForm.value.mean) return
  clearTimeout(lookupTimer)
  lookupTimer = setTimeout(() => {
    const result = lookupWord(val)
    if (result) {
      addForm.value.phonetic = result.phonetic
      addForm.value.mean = result.mean
      if (!addForm.value.sentence) addForm.value.sentence = result.sentence
      ElMessage.success(`已从内置词典（${dictSize()}词）自动填充`)
    }
  }, 600)
}

function handleLookup() {
  const result = lookupWord(addForm.value.word)
  if (result) {
    addForm.value.phonetic = result.phonetic
    addForm.value.mean = result.mean
    if (!addForm.value.sentence) addForm.value.sentence = result.sentence
    ElMessage.success('查词成功')
  } else {
    ElMessage.warning('内置词典未收录此词，请手动填写')
  }
}

const filteredWords = computed(() => {
  if (!searchText.value) return wordStore.wordList
  const q = searchText.value.toLowerCase()
  return wordStore.wordList.filter(w =>
    w.word.toLowerCase().includes(q) || w.mean.includes(q)
  )
})

onMounted(async () => {
  if (!bookStore.bookList.length) await bookStore.loadBooks()
  if (bookStore.currentBookId) await wordStore.loadWords(bookStore.currentBookId)
})

watch(() => bookStore.currentBookId, async (id) => {
  if (id) await wordStore.loadWords(id)
})

function selectBook(book) {
  bookStore.selectBook(book.id)
}

async function handleDeleteBook(book) {
  await bookStore.deleteBook(book.id)
  if (bookStore.currentBookId) await wordStore.loadWords(bookStore.currentBookId)
}

async function handleAddBook() {
  if (!newBookName.value) return
  await bookStore.addBook(newBookName.value)
  newBookName.value = ''
}

async function handleAddWord() {
  if (!addForm.value.word || !bookStore.currentBookId) return
  await wordStore.addWord({
    bookId: bookStore.currentBookId,
    ...addForm.value
  })
  addForm.value = { word: '', phonetic: '', mean: '', sentence: '' }
}

async function handleDeleteWord(id) {
  await wordStore.deleteWord(id)
  if (bookStore.currentBookId) await wordStore.loadWords(bookStore.currentBookId)
}

function openImport() {
  importDialogRef.value?.open()
}

/** 导出所有数据为 JSON */
function exportData() {
  const data = {
    version: '2.0',
    exportTime: new Date().toISOString(),
    books: Storage.get(DB_KEYS.BOOK_LIST) || [],
    words: Storage.get(DB_KEYS.WORD_DATA) || [],
    wrongWords: Storage.get(DB_KEYS.WRONG_WORDS) || [],
    learnRecord: Storage.get(DB_KEYS.LEARN_RECORD) || {}
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `word-review-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('导出成功')
}

/** 从 JSON 文件恢复数据 */
function importData(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (data.books) Storage.set(DB_KEYS.BOOK_LIST, data.books)
      if (data.words) Storage.set(DB_KEYS.WORD_DATA, data.words)
      if (data.wrongWords) Storage.set(DB_KEYS.WRONG_WORDS, data.wrongWords)
      if (data.learnRecord) Storage.set(DB_KEYS.LEARN_RECORD, data.learnRecord)
      bookStore.loadBooks()
      wordStore.loadWords(bookStore.currentBookId)
      ElMessage.success('数据恢复成功')
    } catch (err) {
      ElMessage.error('文件格式错误，恢复失败')
    }
  }
  reader.readAsText(file.raw)
}

function levelTagType(level) {
  if (!level || level === 0) return 'info'
  if (level <= 2) return 'warning'
  if (level <= 4) return 'primary'
  return 'success'
}
</script>

<style scoped>
.book-header-row {
  margin-bottom: 10px;
}
.book-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.book-list li {
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 6px;
  margin-bottom: 2px;
  transition: background 0.2s;
}
.book-list li:hover {
  background: #f0f2f5;
}
.book-list li.active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 500;
}
.book-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.book-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.book-count {
  font-size: 12px;
  color: #909399;
  flex-shrink: 0;
}
.word-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.word-list-actions {
  display: flex;
  gap: 8px;
}
.search-input {
  width: 200px;
}
.table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.data-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

/* 移动端修复 */
@media (max-width: 768px) {
  .el-table { width: 100%; overflow-x: auto; display: block; }
}
@media (max-width: 640px) {
  .word-list-header { flex-direction: column; align-items: flex-start; gap: 8px; }
  .word-list-actions { width: 100%; }
  .word-list-actions .el-input { width: 100% !important; }
  .table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .data-actions { flex-direction: column; align-items: stretch; }
  .data-actions .el-upload { width: 100%; }
  .data-actions .el-upload .el-button { width: 100%; }
  .data-actions .el-button { width: 100%; }
}
</style>
