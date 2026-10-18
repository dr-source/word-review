<template>
  <div class="spelling-mode">
    <div class="spelling-header">
      <span class="mode-badge">✏️ 拼写模式</span>
      <span class="spelling-progress">今日任务 {{ doneCount }}/{{ totalCount }}</span>
    </div>
    <el-progress :percentage="progressPct" :stroke-width="6" :show-text="false" color="#22C55E" />

    <div class="spelling-card" v-if="currentWord">
      <p class="spelling-hint">看中文释义，拼出对应的英文单词</p>
      <div class="mean-display">{{ currentWord.mean }}</div>
      <p v-if="currentWord.phonetic" class="phonetic-hint">提示：{{ currentWord.phonetic }}</p>
      <p class="sentence-hint" v-if="currentWord.sentence">{{ currentWord.sentence }}</p>
      <div class="input-row">
        <el-input ref="inputRef" v-model="userInput" placeholder="输入英文单词..." size="large" :disabled="answered" @keyup.enter="checkAnswer" />
        <el-button type="primary" size="large" :disabled="!userInput || answered" @click="checkAnswer">确认</el-button>
      </div>
      <div v-if="answered" class="spelling-result">
        <div :class="isCorrect ? 'result-correct' : 'result-wrong'">
          <span v-if="isCorrect">✅ 正确！</span>
          <span v-else>❌ 正确答案：<strong>{{ currentWord.word }}</strong></span>
        </div>
        <p v-if="!isCorrect" class="retry-hint">这个词本轮最后会再出现一次</p>
        <el-button type="primary" @click="next" style="margin-top:12px;">{{ queue.length ? '下一题' : '完成' }}</el-button>
      </div>
    </div>

    <el-empty v-else-if="loading" description="加载中..." />
    <el-empty v-else-if="totalCount > 0" description="今日任务完成！">
      <el-button type="primary" @click="$emit('done')">返回</el-button>
    </el-empty>
    <el-empty v-else description="今天还没有可拼写的单词">
      <el-button type="primary" @click="$emit('done')">返回</el-button>
    </el-empty>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useWordStore } from '../stores/wordStore'
import { useSpeech } from '../composables/useSpeech'

const props = defineProps({ bookId: { type: [Number, String], default: 0 } })
const emit = defineEmits(['done'])
const { speak } = useSpeech()

const wordStore = useWordStore()
const queue = ref([])
const currentWord = ref(null)
const userInput = ref('')
const answered = ref(false)
const doneCount = ref(0)
const totalCount = ref(0)
const loading = ref(false)
const inputRef = ref(null)
let requeued = new Set()

const progressPct = computed(() => totalCount.value
  ? Math.min(100, Math.round((doneCount.value / totalCount.value) * 100))
  : 0)
const isCorrect = computed(() => {
  if (!answered.value || !currentWord.value) return false
  return userInput.value.trim().toLowerCase() === currentWord.value.word.toLowerCase()
})

watch(() => props.bookId, async (id) => { if (id) await init(id) }, { immediate: true })

async function init(bookId) {
  loading.value = true
  await wordStore.loadWords(bookId)

  const onlyWrong = wordStore.studyFilter === 'wrong'
  wordStore.studyFilter = ''
  let source
  if (onlyWrong) {
    source = wordStore.wordList.filter(w => w.wrong && w.word)
  } else {
    wordStore.ensureDailyTask(bookId)
    // 与翻卡背记、选择题使用同一批任务词与同一顺序
    source = wordStore.taskWords.filter(w => w.word)
  }

  queue.value = source.map(w => ({ ...w }))
  totalCount.value = queue.value.length
  doneCount.value = 0
  requeued = new Set()
  userInput.value = ''
  answered.value = false
  loading.value = false
  advance()
}

function advance() {
  answered.value = false
  userInput.value = ''
  currentWord.value = queue.value.shift() || null
  if (currentWord.value) nextTick(() => inputRef.value?.focus())
}

function checkAnswer() {
  if (!userInput.value || answered.value || !currentWord.value) return
  answered.value = true
  doneCount.value++

  const word = currentWord.value
  if (isCorrect.value) {
    wordStore.markRight(word.id)
    speak(word.word)
  } else {
    wordStore.markWrong(word.id)
    if (!requeued.has(word.id)) {
      requeued.add(word.id)
      queue.value.push(word)
      totalCount.value = doneCount.value + queue.value.length
    }
  }
}

function next() { advance() }
</script>

<style scoped>
.spelling-mode { max-width: 520px; margin: 0 auto; }
.spelling-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; }
.mode-badge { font-weight: 600; font-size: 15px; }
.spelling-progress { font-size: 14px; color: var(--color-text-muted); }
.spelling-card { background: white; border-radius: var(--radius-xl); padding: 32px; margin-top: 20px; box-shadow: var(--shadow-md); text-align: center; }
.spelling-hint { font-size: 14px; color: var(--color-text-muted); margin-bottom: 16px; }
.mean-display { font-size: 22px; font-weight: 600; color: var(--color-text); margin-bottom: 8px; }
.phonetic-hint { font-size: 14px; color: var(--color-primary); margin-bottom: 4px; }
.sentence-hint { font-size: 13px; color: var(--color-text-muted); font-style: italic; margin-bottom: 20px; }
.input-row { display: flex; gap: 8px; }
.spelling-result { margin-top: 20px; }
.result-correct { color: #16A34A; font-weight: 600; font-size: 16px; }
.result-wrong { color: #DC2626; font-weight: 600; font-size: 16px; }
.retry-hint { margin-top: 4px; font-size: 12px; color: var(--color-text-muted); }
@media (max-width: 640px) {
  .spelling-card { padding: 20px; }
  .mean-display { font-size: 18px; }
}
</style>
