<template>
  <div class="quiz-mode">
    <div class="quiz-header">
      <span class="mode-badge">📝 选择题</span>
      <span class="quiz-progress">今日任务 {{ doneCount }}/{{ totalCount }}</span>
    </div>
    <el-progress :percentage="progressPct" :stroke-width="6" :show-text="false" color="#F59E0B" />

    <div class="quiz-card" v-if="currentWord">
      <h2 class="quiz-word">{{ currentWord.word }}</h2>
      <p class="quiz-hint">看英文，选择正确的中文释义</p>
      <div class="quiz-options">
        <el-button
          v-for="(opt, i) in options"
          :key="i"
          class="quiz-option"
          :class="optionClass(i)"
          :disabled="answered"
          @click="handleSelect(i)"
        >
          <span class="option-letter">{{ ['A', 'B', 'C', 'D'][i] }}</span>
          <span class="option-text">{{ opt.mean }}</span>
          <span class="option-icon" v-if="answered && i === correctIdx">✅</span>
          <span class="option-icon" v-if="answered && i === selectedIdx && i !== correctIdx">❌</span>
          <span class="option-icon" v-else-if="!answered && i === pendingIdx">🔘</span>
        </el-button>
      </div>

      <div v-if="!answered" class="quiz-actions">
        <el-button class="quiz-confirm" type="primary" :disabled="pendingIdx < 0" @click="submit">
          确认
        </el-button>
        <p class="quiz-tip">
          {{ pendingIdx < 0 ? '选一个答案，再点「确认」提交' : '还没提交，点别的选项可以重选' }}
        </p>
      </div>

      <div v-if="answered" class="quiz-feedback">
        <p :class="isCorrect ? 'feedback-correct' : 'feedback-wrong'">
          {{ isCorrect ? '🎉 回答正确！' : '😅 正确答案是：' + currentWord.mean }}
        </p>
        <p class="quiz-sentence" v-if="currentWord.sentence">例句：{{ currentWord.sentence }}</p>
        <p v-if="!isCorrect" class="feedback-retry">这个词本轮最后会再出现一次</p>
        <el-button type="primary" @click="next" style="margin-top: 8px;">下一题</el-button>
      </div>
    </div>

    <el-empty v-else-if="loading" description="加载中..." />
    <el-empty v-else-if="totalCount > 0" description="今日任务完成！">
      <div class="encouragement">
        <p class="encourage-main">{{ encouragement }}</p>
        <p class="encourage-extra">{{ extra }}</p>
      </div>
      <el-button type="primary" @click="$emit('done')">返回</el-button>
    </el-empty>
    <el-empty v-else description="今天还没有可选择的单词">
      <el-button type="primary" @click="$emit('done')">返回</el-button>
    </el-empty>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useWordStore } from '../stores/wordStore'
import { pickDistractors } from '../utils/distractors'
import { MAIN_ENCOURAGEMENT, pickExtra } from '../utils/encouragement'
import { todayStr } from '../utils/profile'

const props = defineProps({ bookId: { type: [Number, String], default: 0 } })
const emit = defineEmits(['done'])

const wordStore = useWordStore()
const queue = ref([])
const currentWord = ref(null)
const options = ref([])
const correctIdx = ref(0)
const selectedIdx = ref(-1)
const pendingIdx = ref(-1)
const answered = ref(false)
const doneCount = ref(0)
const totalCount = ref(0)
const loading = ref(false)
let requeued = new Set()
// 最近出过的释义，避免同一套干扰项反复出现
let recentMeans = []

const encouragement = MAIN_ENCOURAGEMENT
const extra = pickExtra(todayStr())
const progressPct = computed(() => totalCount.value
  ? Math.min(100, Math.round((doneCount.value / totalCount.value) * 100))
  : 0)
const isCorrect = computed(() => selectedIdx.value === correctIdx.value)

watch(() => props.bookId, async (id) => { if (id) await initQuiz(id) }, { immediate: true })

async function initQuiz(bookId) {
  loading.value = true
  await wordStore.loadWords(bookId)

  const onlyWrong = wordStore.studyFilter === 'wrong'
  wordStore.studyFilter = ''
  let source
  if (onlyWrong) {
    source = wordStore.wordList.filter(w => w.wrong && w.mean)
  } else {
    wordStore.ensureDailyTask(bookId)
    // 和翻卡背记同一批词、同一个顺序；乱序开关在 store 里统一生效
    source = wordStore.taskWords.filter(w => w.mean)
  }

  queue.value = source.map(w => ({ ...w }))
  totalCount.value = queue.value.length
  doneCount.value = 0
  requeued = new Set()
  recentMeans = []
  loading.value = false
  advance()
}

function advance() {
  answered.value = false
  selectedIdx.value = -1
  pendingIdx.value = -1
  currentWord.value = queue.value.shift() || null
  if (currentWord.value) generateOptions()
}

function generateOptions() {
  const word = currentWord.value
  if (!word) return
  // 干扰项来自整个词库，优先同词性、易混淆，且避开最近出过的释义
  const distractors = pickDistractors(word, wordStore.wordList, { count: 3, recent: recentMeans })
  const opts = [word, ...distractors]
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  options.value = opts
  correctIdx.value = opts.findIndex(o => o.id === word.id)
  recentMeans = [...opts.map(o => o.mean), ...recentMeans].slice(0, 24)
}

function handleSelect(idx) {
  if (answered.value) return
  // 只记下选择，提交前随时可以改
  pendingIdx.value = pendingIdx.value === idx ? -1 : idx
}

function submit() {
  if (answered.value || pendingIdx.value < 0) return
  selectedIdx.value = pendingIdx.value
  answered.value = true
  doneCount.value++

  const word = currentWord.value
  if (selectedIdx.value === correctIdx.value) {
    wordStore.markRight(word.id)
  } else {
    wordStore.markWrong(word.id)
    // 答错的词在本轮末尾再出一次，只重排一次
    if (!requeued.has(word.id)) {
      requeued.add(word.id)
      queue.value.push(word)
      totalCount.value = doneCount.value + queue.value.length
    }
  }
}

function next() {
  advance()
  if (!currentWord.value) ElMessage.success(MAIN_ENCOURAGEMENT)
}

function optionClass(idx) {
  if (!answered.value) return idx === pendingIdx.value ? 'option-pending' : ''
  if (idx === correctIdx.value) return 'option-correct'
  if (idx === selectedIdx.value) return 'option-wrong'
  return 'option-dim'
}
</script>

<style scoped>
.quiz-mode { max-width: 520px; margin: 0 auto; }
.quiz-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; }
.mode-badge { font-weight: 600; font-size: 15px; }
.quiz-progress { font-size: 14px; color: var(--color-text-muted); }
.quiz-card { background: white; border-radius: var(--radius-xl); padding: 32px; margin-top: 20px; box-shadow: var(--shadow-md); text-align: center; }
.quiz-word { font-size: 36px; margin-bottom: 4px; }
.quiz-hint { font-size: 14px; color: var(--color-text-muted); margin-bottom: 24px; }
.quiz-options { display: flex; flex-direction: column; gap: 10px; }
.quiz-option { display: flex; align-items: center; gap: 10px; width: 100%; height: auto !important; padding: 14px 16px !important; border-radius: var(--radius-md) !important; border: 2px solid var(--color-border) !important; background: #FAFAFA !important; color: var(--color-text) !important; white-space: normal; text-align: left; }
.quiz-option:hover:not(:disabled) { border-color: var(--color-primary) !important; background: rgba(74, 108, 247, 0.04) !important; }
.option-letter { font-weight: 700; color: var(--color-primary); width: 24px; flex-shrink: 0; }
.option-text { flex: 1; }
.option-icon { margin-left: auto; font-size: 18px; }
.option-pending { border-color: var(--color-primary) !important; background: rgba(74, 108, 247, 0.1) !important; }
.option-correct { border-color: #22C55E !important; background: #F0FDF4 !important; }
.option-wrong { border-color: #EF4444 !important; background: #FEF2F2 !important; }
.option-dim { opacity: 0.5; }
.quiz-actions { margin-top: 20px; }
.quiz-actions .quiz-confirm { min-width: 140px; height: 44px; font-size: 16px; }
.quiz-tip { margin-top: 8px; font-size: 12px; color: var(--color-text-muted); }
.quiz-feedback { margin-top: 20px; }
.feedback-correct { color: #16A34A; font-weight: 600; }
.feedback-wrong { color: #DC2626; font-weight: 600; }
.quiz-sentence { margin-top: 8px; font-size: 13px; color: var(--color-text-muted); line-height: 1.6; }
.feedback-retry { margin-top: 4px; font-size: 12px; color: var(--color-text-muted); }
.encouragement { margin-bottom: 16px; }
.encourage-main { font-size: 17px; font-weight: 600; color: var(--color-primary); line-height: 1.6; }
.encourage-extra { margin-top: 6px; font-size: 14px; color: var(--color-text-muted); }
@media (max-width: 640px) {
  .quiz-word { font-size: 28px; }
  .quiz-card { padding: 20px; }
  .quiz-option { padding: 12px !important; font-size: 14px; }
}
</style>
