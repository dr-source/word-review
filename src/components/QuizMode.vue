<template>
  <div class="quiz-mode">
    <div class="quiz-header">
      <span class="mode-badge">📝 选择题</span>
      <span class="quiz-progress">{{ doneCount }}/{{ totalCount }}</span>
    </div>
    <el-progress :percentage="progressPct" :stroke-width="6" :show-text="false" color="#F59E0B" />

    <div class="quiz-card" v-if="currentWord">
      <h2 class="quiz-word">{{ currentWord.word }}</h2>
      <p class="quiz-hint">选择正确的释义</p>
      <div class="quiz-options">
        <el-button v-for="(opt, i) in options" :key="i" class="quiz-option" :class="optionClass(i)" :disabled="answered" @click="handleSelect(i)">
          <span class="option-letter">{{ ['A','B','C','D'][i] }}</span>
          <span class="option-text">{{ opt }}</span>
          <span class="option-icon" v-if="answered && i === correctIdx">✅</span>
          <span class="option-icon" v-if="answered && i === selectedIdx && i !== correctIdx">❌</span>
        </el-button>
      </div>
      <div v-if="answered" class="quiz-feedback">
        <p :class="isCorrect ? 'feedback-correct' : 'feedback-wrong'">
          {{ isCorrect ? '🎉 回答正确！' : '😅 正确答案是：' + currentWord.mean }}
        </p>
        <el-button type="primary" @click="next" style="margin-top:8px;">下一题</el-button>
      </div>
    </div>

    <el-empty v-if="!currentWord" description="答题完成！">
      <el-button type="primary" @click="$emit('done')">返回</el-button>
    </el-empty>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { getWordsByBook } from '../utils/word'
import { wordRight, wordWrong } from '../utils/word'

const props = defineProps({ bookId: { type: String, default: '' } })
const emit = defineEmits(['done'])

const words = ref([])
const currentIdx = ref(0)
const options = ref([])
const correctIdx = ref(0)
const selectedIdx = ref(-1)
const answered = ref(false)
const doneCount = ref(0)

const totalCount = computed(() => words.value.length)
const progressPct = computed(() => totalCount.value ? Math.round((currentIdx.value / totalCount.value) * 100) : 0)
const currentWord = computed(() => words.value[currentIdx.value])
const isCorrect = computed(() => selectedIdx.value === correctIdx.value)

watch(() => props.bookId, (id) => { if (id) initQuiz(id) }, { immediate: true })

function initQuiz(bookId) {
  const all = getWordsByBook(bookId).filter(w => w.mean).sort(() => Math.random() - 0.5).slice(0, 20)
  words.value = all
  currentIdx.value = 0; doneCount.value = 0; generateOptions()
}

function generateOptions() {
  const word = currentWord.value; if (!word) return
  selectedIdx.value = -1; answered.value = false
  const distractors = getWordsByBook(props.bookId).filter(w => w.mean && w.id !== word.id).sort(() => Math.random() - 0.5).slice(0, 3).map(w => w.mean)
  const opts = [word.mean, ...distractors].sort(() => Math.random() - 0.5)
  options.value = opts; correctIdx.value = opts.indexOf(word.mean)
}

function handleSelect(idx) {
  if (answered.value) return
  selectedIdx.value = idx; answered.value = true; doneCount.value++
  if (idx === correctIdx.value) wordRight(currentWord.value.id)
  else wordWrong(currentWord.value.id)
}

function next() { currentIdx.value++; if (currentWord.value) generateOptions() }

function optionClass(idx) {
  if (!answered.value) return ''
  if (idx === correctIdx.value) return 'option-correct'
  if (idx === selectedIdx.value && idx !== correctIdx.value) return 'option-wrong'
  return 'option-dim'
}
</script>

<style scoped>
.quiz-mode { max-width: 520px; margin: 0 auto; }
.quiz-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.mode-badge { font-weight: 600; font-size: 15px; }
.quiz-progress { font-size: 14px; color: var(--color-text-muted); }
.quiz-card { background: white; border-radius: var(--radius-xl); padding: 32px; margin-top: 20px; box-shadow: var(--shadow-md); text-align: center; }
.quiz-word { font-size: 36px; margin-bottom: 4px; }
.quiz-hint { font-size: 14px; color: var(--color-text-muted); margin-bottom: 24px; }
.quiz-options { display: flex; flex-direction: column; gap: 10px; }
.quiz-option { display: flex; align-items: center; gap: 10px; width: 100%; height: auto !important; padding: 14px 16px !important; border-radius: var(--radius-md) !important; border: 2px solid var(--color-border) !important; background: #FAFAFA !important; color: var(--color-text) !important; white-space: normal; text-align: left; }
.quiz-option:hover:not(.answered) { border-color: var(--color-primary) !important; background: rgba(74,108,247,0.04) !important; }
.option-letter { font-weight: 700; color: var(--color-primary); width: 24px; }
.option-icon { margin-left: auto; font-size: 18px; }
.option-correct { border-color: #22C55E !important; background: #F0FDF4 !important; }
.option-wrong { border-color: #EF4444 !important; background: #FEF2F2 !important; }
.option-dim { opacity: 0.5; }
.quiz-feedback { margin-top: 20px; }
.feedback-correct { color: #16A34A; font-weight: 600; }
.feedback-wrong { color: #DC2626; font-weight: 600; }
@media (max-width: 640px) {
  .quiz-word { font-size: 28px; }
  .quiz-card { padding: 20px; }
  .quiz-option { padding: 12px !important; font-size: 14px; }
}
</style>
