<template>
  <div class="spelling-mode">
    <div class="spelling-header">
      <span class="mode-badge">✏️ 拼写模式</span>
      <span class="spelling-progress">{{ doneCount }}/{{ totalCount }}</span>
    </div>
    <el-progress :percentage="progressPct" :stroke-width="6" :show-text="false" color="#22C55E" />

    <div class="spelling-card" v-if="currentWord">
      <p class="spelling-hint">看释义，输入对应的英文单词</p>
      <div class="mean-display">{{ currentWord.mean }}</div>
      <p v-if="currentWord.phonetic" class="phonetic-hint">提示：{{ currentWord.phonetic }}</p>
      <p class="sentence-hint" v-if="currentWord.sentence">{{ currentWord.sentence }}</p>

      <div class="input-row">
        <el-input
          ref="inputRef"
          v-model="userInput"
          placeholder="输入英文单词..."
          size="large"
          :disabled="answered"
          @keyup.enter="checkAnswer"
        />
        <el-button
          type="primary"
          size="large"
          :disabled="!userInput || answered"
          @click="checkAnswer"
          class="check-btn"
        >
          确认
        </el-button>
      </div>

      <div v-if="answered" class="spelling-result">
        <div :class="isCorrect ? 'result-correct' : 'result-wrong'">
          <span v-if="isCorrect">✅ 正确！</span>
          <span v-else>❌ 正确答案：<strong>{{ currentWord.word }}</strong></span>
        </div>
        <el-button type="primary" @click="next" style="margin-top:12px;">
          {{ currentIdx < totalCount - 1 ? '下一题' : '完成' }}
        </el-button>
      </div>
    </div>

    <el-empty v-if="!currentWord" description="拼写练习完成！">
      <el-button type="primary" @click="$emit('done')">返回</el-button>
    </el-empty>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { getWordsByBook } from '../utils/word'
import { wordRight, wordWrong } from '../utils/word'
import { useSpeech } from '../composables/useSpeech'

const props = defineProps({ bookId: { type: String, default: '' } })
const emit = defineEmits(['done'])
const { speak } = useSpeech()

const words = ref([])
const currentIdx = ref(0)
const userInput = ref('')
const answered = ref(false)
const score = ref(0)
const doneCount = ref(0)
const inputRef = ref(null)

const totalCount = computed(() => words.value.length)
const progressPct = computed(() => totalCount.value ? Math.round((currentIdx.value / totalCount.value) * 100) : 0)
const currentWord = computed(() => words.value[currentIdx.value])
const isCorrect = computed(() => {
  if (!answered.value || !currentWord.value) return false
  return userInput.value.trim().toLowerCase() === currentWord.value.word.toLowerCase()
})

watch(() => props.bookId, (id) => {
  if (id) init(id)
}, { immediate: true })

function init(bookId) {
  const all = getWordsByBook(bookId).filter(w => w.mean)
    .sort(() => Math.random() - 0.5)
    .slice(0, 20)
  words.value = all
  currentIdx.value = 0
  score.value = 0
  doneCount.value = 0
  userInput.value = ''
  answered.value = false
  nextTick(() => inputRef.value?.focus())
}

function checkAnswer() {
  if (!userInput.value || answered.value) return
  answered.value = true
  doneCount.value++

  if (isCorrect.value) {
    score.value++
    wordRight(currentWord.value.id)
    speak(currentWord.value.word)
  } else {
    wordWrong(currentWord.value.id)
  }
}

function next() {
  currentIdx.value++
  userInput.value = ''
  answered.value = false
  if (currentWord.value) {
    nextTick(() => inputRef.value?.focus())
  }
}
</script>

<style scoped>
.spelling-mode { max-width: 520px; margin: 0 auto; }
.spelling-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.mode-badge { font-weight: 600; font-size: 15px; }
.spelling-progress { font-size: 14px; color: var(--color-text-muted); }
.spelling-card { background: white; border-radius: var(--radius-xl); padding: 32px; margin-top: 20px; box-shadow: var(--shadow-md); text-align: center; }
.spelling-hint { font-size: 14px; color: var(--color-text-muted); margin-bottom: 16px; }
.mean-display { font-size: 22px; font-weight: 600; color: var(--color-text); margin-bottom: 8px; }
.phonetic-hint { font-size: 14px; color: var(--color-primary); margin-bottom: 4px; }
.sentence-hint { font-size: 13px; color: var(--color-text-muted); font-style: italic; margin-bottom: 20px; }
.input-row { display: flex; gap: 8px; margin-bottom: 0; }
.check-btn { min-width: 80px; }
.spelling-result { margin-top: 20px; }
.result-correct { color: #16A34A; font-weight: 600; font-size: 16px; }
.result-wrong { color: #DC2626; font-weight: 600; font-size: 16px; }
</style>
