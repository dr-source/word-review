<template>
  <div class="flashcard-mode">
    <div v-if="currentWord" class="study-container">
      <div class="study-header">
        <div class="progress-info">
          <span class="progress-badge">{{ studiedCount }}/{{ totalCount }}</span>
          <span class="progress-text" v-if="currentWord.learnLevel === 0">新词</span>
          <span class="progress-text" v-else>复习</span>
        </div>
      </div>
      <el-progress :percentage="progressPercent" :stroke-width="6" :show-text="false" color="#4A6CF7" class="study-progress-bar" />
      <div class="flashcard-wrapper" @click="handleShowAnswer">
        <div class="flashcard" :class="{ flipped: showAnswer, 'no-animate': noAnimation }">
          <div class="flashcard-inner">
            <div class="flashcard-front">
              <h1 class="word-text">{{ currentWord.word }}</h1>
              <p class="word-hint">点击卡片显示答案</p>
            </div>
            <div class="flashcard-back">
              <p class="word-phonetic">{{ currentWord.phonetic || '' }}</p>
              <p class="word-meaning">{{ currentWord.mean }}</p>
              <p v-if="currentWord.sentence" class="word-sentence">"{{ currentWord.sentence }}"</p>
            </div>
          </div>
        </div>
      </div>
      <div class="study-actions">
        <div class="speech-row">
          <el-button size="small" circle @click="speak(currentWord.word)"><el-icon><Microphone /></el-icon></el-button>
          <span class="speech-label">美音</span>
          <el-button size="small" circle @click="speak(currentWord.word, true)"><el-icon><Microphone /></el-icon></el-button>
          <span class="speech-label">英音</span>
        </div>
        <transition name="slide-up">
          <div v-if="showAnswer" class="rating-buttons">
            <el-button class="rating-btn rating-again" :disabled="ratingLocked" @click="handleRating('again')">
              <span class="rating-key">1</span><span class="rating-text">不认识</span><span class="rating-desc">5分钟</span>
            </el-button>
            <el-button class="rating-btn rating-hard" :disabled="ratingLocked" @click="handleRating('hard')">
              <span class="rating-key">2</span><span class="rating-text">模糊</span><span class="rating-desc">降低等级</span>
            </el-button>
            <el-button class="rating-btn rating-good" :disabled="ratingLocked" @click="handleRating('good')">
              <span class="rating-key">3</span><span class="rating-text">认识</span><span class="rating-desc">提升等级</span>
            </el-button>
          </div>
        </transition>
      </div>
    </div>
    <el-empty v-else-if="loading" description="加载中..." />
    <el-empty v-else description="当前词本暂无待背诵单词">
      <el-button type="primary" @click="router.push('/books')">去添加单词</el-button>
    </el-empty>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWordStore } from '../stores/wordStore'
import { useBookStore } from '../stores/bookStore'
import { useSpeech } from '../composables/useSpeech'

const props = defineProps({ bookId: { type: Number, default: 0 } })
const router = useRouter()
const wordStore = useWordStore()
const bookStore = useBookStore()
const { speak } = useSpeech()

const studyQueue = ref([])
const currentWord = ref(null)
const showAnswer = ref(false)
const studiedCount = ref(0)
const totalCount = ref(0)
const ratingLocked = ref(false)
const loading = ref(false)
const noAnimation = ref(false)

const progressPercent = computed(() => {
  if (!totalCount.value) return 0
  return Math.round((studiedCount.value / totalCount.value) * 100)
})

watch(() => props.bookId, async (id) => { if (id) await startStudy() }, { immediate: true })
onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

async function startStudy() {
  if (!props.bookId) return
  loading.value = true
  await wordStore.loadWords(props.bookId)
  wordStore.initStudyQueue(props.bookId)
  studiedCount.value = 0
  totalCount.value = wordStore.studyQueue.length
  loading.value = false
  nextWord()
}

function nextWord() {
  showAnswer.value = false
  currentWord.value = wordStore.studyQueue.shift() || null
}
function handleShowAnswer() { showAnswer.value = true }

function handleRating(type) {
  if (ratingLocked.value || !currentWord.value) return
  ratingLocked.value = true
  if (type === 'again') wordStore.markWrong(currentWord.value.id)
  else if (type === 'hard') wordStore.markWrong(currentWord.value.id)
  else wordStore.markRight(currentWord.value.id)
  studiedCount.value++
  // 禁用动画，直接切到下一个单词的正面
  noAnimation.value = true
  nextWord()
  // 重新启用动画（等待下一个点击翻卡）
  setTimeout(() => { noAnimation.value = false; ratingLocked.value = false }, 300)
}

function handleKeydown(e) {
  if ((e.key === ' ' || e.key === 'Enter') && !showAnswer.value) { e.preventDefault(); handleShowAnswer() }
  if (showAnswer.value) {
    if (e.key === '1') handleRating('again')
    if (e.key === '2') handleRating('hard')
    if (e.key === '3') handleRating('good')
  }
}
</script>

<style scoped>
.flashcard-mode { width: 100%; }
.study-container { width: 100%; }
.study-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.progress-info { display: flex; align-items: center; gap: 8px; }
.progress-badge { font-size: 14px; font-weight: 600; color: var(--color-text); }
.progress-text { font-size: 12px; color: var(--color-text-muted); background: #F1F5F9; padding: 2px 8px; border-radius: 9999px; }
.study-progress-bar { margin-bottom: 24px; }
.flashcard-wrapper { perspective: 1200px; margin-bottom: 24px; cursor: pointer; }
.flashcard { height: 280px; transition: transform 0.5s cubic-bezier(0.4,0,0.2,1); transform-style: preserve-3d; }
.flashcard.no-animate { transition: none; }
.flashcard.flipped { transform: rotateY(180deg); }
.flashcard-inner { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
.flashcard-front, .flashcard-back {
  position: absolute; inset: 0; backface-visibility: hidden;
  border-radius: var(--radius-xl); background: white;
  border: 1px solid var(--color-border); box-shadow: var(--shadow-md);
  display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px;
}
.flashcard-back { transform: rotateY(180deg); }
.word-text { font-size: 42px; font-weight: 700; color: var(--color-text); margin-bottom: 12px; letter-spacing: 2px; }
.word-hint { font-size: 14px; color: var(--color-text-muted); }
.word-phonetic { font-size: 18px; color: var(--color-text-muted); margin-bottom: 12px; }
.word-meaning { font-size: 24px; font-weight: 600; color: var(--color-primary); margin-bottom: 8px; }
.word-sentence { font-size: 14px; color: var(--color-text-secondary); font-style: italic; text-align: center; line-height: 1.6; }
.study-actions { text-align: center; }
.speech-row { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 20px; }
.speech-label { font-size: 12px; color: var(--color-text-muted); margin-right: 12px; }
.rating-buttons { display: flex; gap: 10px; justify-content: center; }
.rating-btn {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 14px 18px !important; height: auto !important;
  border-radius: var(--radius-lg) !important; border: 2px solid transparent !important;
  min-width: 110px; transition: all var(--transition-normal);
}
.rating-btn:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.rating-key { font-size: 11px; opacity: 0.6; font-weight: 500; }
.rating-text { font-size: 15px; font-weight: 600; }
.rating-desc { font-size: 10px; opacity: 0.7; }
.rating-again { background: #FEF2F2 !important; color: #DC2626 !important; border-color: #FCA5A5 !important; }
.rating-hard { background: #FFFBEB !important; color: #D97706 !important; border-color: #FCD34D !important; }
.rating-good { background: #F0FDF4 !important; color: #16A34A !important; border-color: #86EFAC !important; }
.slide-up-enter-active { transition: all 0.3s ease-out; }
.slide-up-leave-active { transition: all 0.2s ease-in; }
.slide-up-enter-from { opacity: 0; transform: translateY(20px); }
.slide-up-leave-to { opacity: 0; transform: translateY(-10px); }
@media (max-width: 640px) {
  .flashcard { height: 220px; }
  .flashcard-front, .flashcard-back { padding: 16px; }
  .word-text { font-size: 32px; }
  .word-meaning { font-size: 20px; }
  .rating-buttons { gap: 6px; }
  .rating-btn { min-width: 90px; padding: 10px 12px !important; }
  .rating-text { font-size: 13px; }
  .rating-desc { display: none; }
}
</style>
