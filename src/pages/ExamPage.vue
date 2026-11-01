<template>
  <div class="exam-page">
    <!-- 开始页 -->
    <el-card v-if="stage === 'intro'" class="exam-intro" shadow="never">
      <h2 class="intro-title">单词测试卷</h2>
      <p class="intro-text">
        从当前词本随机抽 {{ size }} 个单词、打乱顺序，看英文选中文，一题 1 分，满分 {{ size }} 分。
      </p>
      <ul class="intro-rules">
        <li><strong>{{ size }} 分</strong> → Excellent（满分）</li>
        <li><strong>{{ Math.ceil(size * 0.95) }} 分及以上</strong> → Good</li>
        <li><strong>{{ Math.ceil(size * 0.9) }} 分及以上</strong> → Normal</li>
        <li><strong>{{ Math.ceil(size * 0.9) }} 分以下</strong> → Come on</li>
      </ul>
      <p class="intro-text" v-if="poolCount === 0" style="color: #EF4444;">
        当前词本还没有可出题的单词，先去「单词管理」导入词表。
      </p>
      <el-button
        class="exam-start"
        type="primary"
        size="large"
        :disabled="poolCount === 0"
        @click="start"
      >
        开始测试
      </el-button>
    </el-card>

    <!-- 答题 -->
    <div v-else-if="stage === 'testing'" class="exam-testing">
      <div class="exam-header">
        <span class="mode-badge">📄 单词测试卷</span>
        <span class="exam-progress">第 {{ index + 1 }} / {{ questions.length }} 题</span>
      </div>
      <el-progress :percentage="answeredPct" :stroke-width="6" :show-text="false" color="#4A6CF7" />

      <div class="exam-card" v-if="current">
        <p class="exam-word">{{ current.word.word }}</p>
        <p class="exam-phonetic" v-if="current.word.phonetic">{{ current.word.phonetic }}</p>
        <div class="exam-options">
          <el-button
            v-for="(opt, i) in current.options"
            :key="opt.id"
            class="exam-option"
            :class="{ 'is-picked': answers[index] === i }"
            @click="pick(i)"
          >
            <span class="option-letter">{{ ['A', 'B', 'C', 'D'][i] }}</span>
            <span class="option-text">{{ opt.mean }}</span>
          </el-button>
        </div>
        <div class="exam-actions">
          <el-button :disabled="index === 0" @click="prev">上一题</el-button>
          <el-button v-if="index < questions.length - 1" type="primary" @click="next">下一题</el-button>
          <el-button v-else type="success" class="exam-submit" @click="submit">交卷</el-button>
        </div>
        <p class="exam-tip">已答 {{ answeredCount }} / {{ questions.length }} 题，可以随时回到前面改答案。</p>
      </div>
    </div>

    <!-- 成绩 -->
    <div v-else class="exam-result">
      <Fireworks :active="showFireworks" />
      <el-card class="result-card" shadow="never">
        <p class="result-score">{{ score }}<span class="result-total"> / {{ questions.length }}</span></p>
        <p class="result-grade" :class="'grade-' + gradeClass">{{ grade.label }}</p>
        <p class="result-tip">{{ grade.tip }}</p>
        <div class="result-actions">
          <el-button class="exam-again" @click="start">再测一次</el-button>
          <el-button type="primary" @click="router.push('/study')">回去背词</el-button>
        </div>
      </el-card>

      <el-card v-if="wrongList.length" class="wrong-card" shadow="never">
        <p class="wrong-title">错的 {{ wrongList.length }} 个词（抄一遍再背）</p>
        <el-table :data="wrongList" stripe border size="small" style="width: 100%">
          <el-table-column type="index" label="#" width="52" align="center" />
          <el-table-column prop="word" label="单词" min-width="120" />
          <el-table-column prop="phonetic" label="音标" min-width="120" />
          <el-table-column prop="mean" label="正确释义" min-width="220" />
        </el-table>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useBookStore } from '../stores/bookStore'
import { useWordStore } from '../stores/wordStore'
import { pickDistractors } from '../utils/distractors'
import { EXAM_SIZE, examGrade, pickExamWords } from '../utils/exam'
import { playFinish, playCorrect, playWrong } from '../composables/useSound'
import Fireworks from '../components/Fireworks.vue'

const router = useRouter()
const bookStore = useBookStore()
const wordStore = useWordStore()

const stage = ref('intro')
const questions = ref([])
const answers = ref([])
const index = ref(0)
const submitted = ref(false)
const showFireworks = ref(false)
const finishPlayed = ref(false)

const poolCount = computed(() => wordStore.wordList.filter(w => w.word && w.mean).length)
const size = computed(() => Math.min(EXAM_SIZE, poolCount.value))
const current = computed(() => questions.value[index.value] || null)
const answeredCount = computed(() => answers.value.filter(a => a >= 0).length)
const answeredPct = computed(() => questions.value.length
  ? Math.round((answeredCount.value / questions.value.length) * 100)
  : 0)

const score = computed(() => {
  if (!submitted.value) return 0
  return questions.value.reduce((n, q, i) => n + (answers.value[i] === q.correctIdx ? 1 : 0), 0)
})

const grade = computed(() => {
  // 题量不足 100 时按比例折算成百分制的评级
  const pct = questions.value.length ? (score.value / questions.value.length) * 100 : 0
  return examGrade(pct)
})

const gradeClass = computed(() => {
  const label = grade.value.label
  if (label === 'Excellent') return 'excellent'
  if (label === 'Good') return 'good'
  if (label === 'Normal') return 'normal'
  return 'comeon'
})

const wrongList = computed(() => {
  if (!submitted.value) return []
  return questions.value
    .filter((q, i) => answers.value[i] !== q.correctIdx)
    .map(q => ({
      id: q.word.id,
      word: q.word.word,
      phonetic: q.word.phonetic || '',
      mean: q.word.mean
    }))
})

onMounted(async () => {
  if (!bookStore.bookList.length) await bookStore.loadBooks()
  if (!bookStore.currentBookId && bookStore.bookList.length) {
    bookStore.selectBook(bookStore.bookList[0].id)
  }
  if (bookStore.currentBookId) await wordStore.loadWords(bookStore.currentBookId)
})

/** 抽词 + 提前把四选项都生成好，答题时不再临时算，卷子才稳定 */
function buildQuestions() {
  const picked = pickExamWords(wordStore.wordList, size.value)
  return picked.map(w => {
    const distractors = pickDistractors(w, wordStore.wordList, { count: 3 })
    const options = [w, ...distractors]
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[options[i], options[j]] = [options[j], options[i]]
    }
    return { word: w, options, correctIdx: options.findIndex(o => o.id === w.id) }
  })
}

function start() {
  if (!poolCount.value) return
  questions.value = buildQuestions()
  answers.value = new Array(questions.value.length).fill(-1)
  index.value = 0
  submitted.value = false
  showFireworks.value = false
  finishPlayed.value = false
  stage.value = 'testing'
}

function pick(i) {
  answers.value[index.value] = i
  const q = questions.value[index.value]
  if (i === q.correctIdx) playCorrect(0)
  else playWrong()
}

function prev() {
  if (index.value > 0) index.value--
}

function next() {
  if (index.value < questions.value.length - 1) index.value++
}

function submit() {
  const left = questions.value.length - answeredCount.value
  if (left > 0) {
    ElMessage.warning(`还有 ${left} 题没选，先补完再交卷`)
    const firstBlank = answers.value.findIndex(a => a < 0)
    if (firstBlank >= 0) index.value = firstBlank
    return
  }
  submitted.value = true
  stage.value = 'result'
  // 每题都登记进进度：对的升级、错的进错题本
  questions.value.forEach((q, i) => {
    if (answers.value[i] === q.correctIdx) wordStore.markRight(q.word.id)
    else wordStore.markWrong(q.word.id)
  })
  if (!finishPlayed.value) {
    finishPlayed.value = true
    showFireworks.value = true
    playFinish()
  }
}
</script>

<style scoped>
.exam-page { max-width: 700px; margin: 0 auto; }
.exam-intro { border-radius: var(--radius-xl); }
.intro-title { font-size: 20px; font-weight: 700; color: var(--color-text); }
.intro-text { margin-top: 10px; font-size: 14px; line-height: 1.7; color: var(--color-text-secondary); }
.intro-rules { margin: 12px 0 0 18px; font-size: 13px; line-height: 1.9; color: var(--color-text-secondary); }
.exam-start { margin-top: 18px; }
.exam-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.mode-badge { font-weight: 600; font-size: 15px; }
.exam-progress { margin-left: auto; font-size: 14px; color: var(--color-text-muted); }
.exam-card {
  margin-top: 18px;
  padding: 28px 24px;
  background: white;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  text-align: center;
}
.exam-word { font-size: 34px; font-weight: 700; color: var(--color-text); }
.exam-phonetic { margin-top: 4px; font-size: 14px; color: var(--color-text-muted); }
.exam-options { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
.exam-option {
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
  white-space: normal;
}
.exam-option.is-picked {
  border-color: var(--color-primary) !important;
  background: rgba(74, 108, 247, 0.1) !important;
}
.option-letter { font-weight: 700; color: var(--color-primary); width: 22px; flex-shrink: 0; }
.option-text { flex: 1; }
.exam-actions { display: flex; justify-content: space-between; margin-top: 18px; gap: 8px; }
.exam-tip { margin-top: 10px; font-size: 12px; color: var(--color-text-muted); }
.result-card { text-align: center; border-radius: var(--radius-xl); }
.result-score { font-size: 46px; font-weight: 800; color: var(--color-primary); }
.result-total { font-size: 20px; color: var(--color-text-muted); font-weight: 600; }
.result-grade { margin-top: 6px; font-size: 26px; font-weight: 800; letter-spacing: 0.5px; }
.grade-excellent { color: #F59E0B; }
.grade-good { color: #22C55E; }
.grade-normal { color: #4A6CF7; }
.grade-comeon { color: #EF4444; }
.result-tip { margin-top: 8px; font-size: 14px; color: var(--color-text-secondary); }
.result-actions { display: flex; justify-content: center; gap: 10px; margin-top: 18px; }
.wrong-card { margin-top: 16px; border-radius: var(--radius-xl); }
.wrong-title { font-size: 14px; font-weight: 600; color: var(--color-text); margin-bottom: 10px; }
@media (max-width: 640px) {
  .exam-card { padding: 20px 16px; }
  .exam-word { font-size: 28px; }
}
</style>
