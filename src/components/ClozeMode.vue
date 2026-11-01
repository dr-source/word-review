<template>
  <div class="cloze-mode">
    <div class="cloze-header">
      <span class="mode-badge">🧩 完形填空</span>
      <span class="cloze-streak" v-if="streak >= 2">🔥 {{ streak }} 连对</span>
      <span class="cloze-progress">{{ doneCount }}/{{ totalCount }}</span>
    </div>
    <el-progress :percentage="progressPct" :stroke-width="6" :show-text="false" color="#4A6CF7" />

    <StreakFlash :label="flashLabel" :count="streak" />

    <div class="cloze-card" v-if="current">
      <p class="cloze-sentence">{{ masked }}</p>
      <p class="cloze-hint">选一个最合适的词填进空格（四个选项词性相同、意思相近）</p>
      <div class="cloze-options">
        <el-button
          v-for="(opt, i) in options"
          :key="opt.id"
          class="cloze-option"
          :class="optionClass(i)"
          :disabled="answered"
          @click="choose(i)"
        >
          <span class="option-letter">{{ ['A', 'B', 'C', 'D'][i] }}</span>
          <span class="option-word">{{ opt.word }}</span>
          <span class="option-icon" v-if="answered && i === correctIdx">✅</span>
          <span class="option-icon" v-else-if="answered && i === selectedIdx">❌</span>
        </el-button>
      </div>

      <div v-if="answered" class="cloze-feedback">
        <p :class="ok ? 'feedback-correct' : 'feedback-wrong'">
          {{ ok ? '🎉 填对了！' : '🤔 再想想，正确答案是：' + current.word }}
        </p>
        <p class="cloze-mean">
          <strong>{{ current.word }}</strong>
          <span v-if="current.phonetic" class="cloze-phonetic">{{ current.phonetic }}</span>
          · {{ current.mean }}
        </p>
        <el-button type="primary" @click="next" style="margin-top: 8px;">下一题</el-button>
      </div>
    </div>

    <el-empty v-else-if="loading" description="加载中..." />
    <template v-else-if="totalCount > 0">
      <Fireworks :active="showFireworks" />
      <el-empty description="完形填空做完啦！">
        <el-button type="primary" @click="$emit('done')">返回</el-button>
      </el-empty>
    </template>
    <el-empty v-else description="这个词本暂时凑不出完形题（需要有例句的单词）">
      <el-button type="primary" @click="$emit('done')">返回</el-button>
    </el-empty>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useWordStore } from '../stores/wordStore'
import { pickDistractors } from '../utils/distractors'
import { playCorrect, playWrong, playStreak, playFinish } from '../composables/useSound'
import { STREAK_TIERS, streakTier } from '../utils/streak'
import Fireworks from './Fireworks.vue'
import StreakFlash from './StreakFlash.vue'
import { maskSentence } from '../utils/cloze'

const props = defineProps({ bookId: { type: [Number, String], default: 0 } })
const emit = defineEmits(['done'])

const MAX_QUESTIONS = 12
const RECENT_DAYS = 3

const wordStore = useWordStore()
const queue = ref([])
const current = ref(null)
const masked = ref('')
const options = ref([])
const correctIdx = ref(0)
const selectedIdx = ref(-1)
const answered = ref(false)
const ok = ref(false)
const doneCount = ref(0)
const totalCount = ref(0)
const loading = ref(false)
const streak = ref(0)
const flashLabel = ref('')
const showFireworks = ref(false)
let flashTimer = 0
let recentMeans = []

const progressPct = computed(() => totalCount.value
  ? Math.min(100, Math.round((doneCount.value / totalCount.value) * 100))
  : 0)

watch(() => props.bookId, async (id) => { if (id) await initCloze(id) }, { immediate: true })

function lastSeenOf(word) {
  const p = wordStore.wordList.find(w => w.id === word.id)
  return (p && p.lastSeenAt) || 0
}

/**
 * 出题池：今天任务里的词优先，其次是最近几天见过的词，再用全库补，
 * 这样选项多半是「昨天或今天刚背过」的词。
 */
function buildCandidates() {
  const now = Date.now()
  const recentFrom = now - RECENT_DAYS * 24 * 60 * 60 * 1000
  const taskIds = new Set((wordStore.task?.ids) || [])
  const seen = new Set()
  const ordered = []
  const push = (w) => {
    if (!w || seen.has(w.id) || !w.word || !w.mean) return
    const sentence = w.sentence || ''
    if (!sentence) return
    const maskedText = maskSentence(sentence, w.word)
    if (!maskedText) return
    seen.add(w.id)
    ordered.push({ ...w, sentence, maskedText })
  }

  wordStore.taskWords.forEach(push)
  wordStore.wordList
    .filter(w => w.sentence && lastSeenOf(w) >= recentFrom && !taskIds.has(w.id))
    .sort((a, b) => lastSeenOf(b) - lastSeenOf(a))
    .forEach(push)
  wordStore.wordList
    .filter(w => w.sentence)
    .sort((a, b) => lastSeenOf(b) - lastSeenOf(a))
    .forEach(push)
  return ordered
}

async function initCloze(bookId) {
  loading.value = true
  await wordStore.loadWords(bookId)
  wordStore.studyFilter = ''
  wordStore.ensureDailyTask(bookId)

  const candidates = buildCandidates()
  queue.value = candidates.slice(0, MAX_QUESTIONS)
  totalCount.value = queue.value.length
  doneCount.value = 0
  streak.value = 0
  flashLabel.value = ''
  showFireworks.value = false
  recentMeans = []
  loading.value = false
  advance()
}

function advance() {
  answered.value = false
  ok.value = false
  selectedIdx.value = -1
  correctIdx.value = 0
  current.value = queue.value.shift() || null
  if (current.value) {
    masked.value = current.value.maskedText
    generateOptions()
  }
}

function generateOptions() {
  const word = current.value
  if (!word) return
  // 干扰项优先从「最近见过的词」里挑，同样是同词性、易混淆
  const recentPool = wordStore.wordList.filter(w => lastSeenOf(w) > 0)
  const pool = recentPool.length >= 30 ? recentPool : wordStore.wordList
  const distractors = pickDistractors(word, pool, { count: 3, recent: recentMeans })
  const opts = [word, ...distractors]
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  options.value = opts
  correctIdx.value = opts.findIndex(o => o.id === word.id)
  recentMeans = [...opts.map(o => o.mean), ...recentMeans].slice(0, 20)
}

function choose(idx) {
  if (answered.value) return
  const word = current.value
  if (!word) return
  answered.value = true
  selectedIdx.value = idx
  ok.value = idx === correctIdx.value
  doneCount.value++
  if (ok.value) {
    wordStore.markRight(word.id)
    registerStreak()
  } else {
    wordStore.markWrong(word.id)
    streak.value = 0
    hideFlash()
    playWrong()
  }
}

function registerStreak() {
  streak.value++
  const tier = streakTier(streak.value)
  if (!tier) { playCorrect(streak.value); return }
  const index = STREAK_TIERS.findIndex(t => t.label === tier.label)
  playStreak(index)
  flashLabel.value = tier.label
  clearTimeout(flashTimer)
  flashTimer = window.setTimeout(hideFlash, 1800)
}

function hideFlash() {
  clearTimeout(flashTimer)
  flashTimer = 0
  flashLabel.value = ''
}

function next() {
  advance()
  if (!current.value) {
    showFireworks.value = true
    playFinish()
  }
}

function optionClass(idx) {
  if (!answered.value) return ''
  if (idx === correctIdx.value) return 'option-correct'
  if (idx === selectedIdx.value) return 'option-wrong'
  return 'option-dim'
}

onUnmounted(() => clearTimeout(flashTimer))
</script>

<style scoped>
.cloze-mode { max-width: 560px; margin: 0 auto; }
.cloze-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.mode-badge { font-weight: 600; font-size: 15px; }
.cloze-streak { margin-left: auto; font-size: 13px; font-weight: 600; color: #F59E0B; }
.cloze-progress { font-size: 14px; color: var(--color-text-muted); }
.cloze-card {
  margin-top: 20px;
  padding: 28px 24px;
  background: white;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
}
.cloze-sentence {
  font-size: 19px;
  line-height: 1.9;
  color: var(--color-text);
  letter-spacing: 0.2px;
}
.cloze-hint { margin-top: 8px; font-size: 12px; color: var(--color-text-muted); }
.cloze-options { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
.cloze-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: auto !important;
  padding: 12px 16px !important;
  border-radius: var(--radius-md) !important;
  border: 2px solid var(--color-border) !important;
  background: #FAFAFA !important;
  color: var(--color-text) !important;
  text-align: left;
  font-size: 17px;
}
.cloze-option:hover:not(:disabled) {
  border-color: var(--color-primary) !important;
  background: rgba(74, 108, 247, 0.04) !important;
}
.option-letter { font-weight: 700; color: var(--color-primary); width: 22px; flex-shrink: 0; }
.option-word { flex: 1; font-weight: 600; }
.option-icon { margin-left: auto; font-size: 18px; }
.option-correct { border-color: #22C55E !important; background: #F0FDF4 !important; }
.option-wrong { border-color: #EF4444 !important; background: #FEF2F2 !important; }
.option-dim { opacity: 0.5; }
.cloze-feedback { margin-top: 18px; }
.feedback-correct { color: #16A34A; font-weight: 600; }
.feedback-wrong { color: #DC2626; font-weight: 600; }
.cloze-mean { margin-top: 8px; font-size: 14px; color: var(--color-text-secondary); line-height: 1.6; }
.cloze-phonetic { margin-left: 6px; font-size: 13px; color: var(--color-text-muted); }
@media (max-width: 640px) {
  .cloze-card { padding: 20px 16px; }
  .cloze-sentence { font-size: 17px; }
  .cloze-option { font-size: 15px; padding: 10px 12px !important; }
}
</style>
