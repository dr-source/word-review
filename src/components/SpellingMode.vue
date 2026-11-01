<template>
  <div class="spelling-mode">
    <div class="spelling-header">
      <span class="mode-badge">✏️ 拼写模式</span>
      <el-button size="small" text class="handwrite-toggle" @click="handwrite = !handwrite">
        {{ handwrite ? '⌨️ 改用键盘' : '✍️ 改用手写' }}
      </el-button>
      <span class="spelling-progress">今日任务 {{ doneCount }}/{{ totalCount }}</span>
    </div>
    <el-progress :percentage="progressPct" :stroke-width="6" :show-text="false" color="#22C55E" />

    <div class="spelling-card" v-if="currentWord">
      <p class="spelling-hint">{{ handwrite ? '看中文释义，把英文单词手写出来' : '看中文释义，拼出对应的英文单词' }}</p>
      <div class="mean-display">{{ currentWord.mean }}</div>
      <p class="sentence-hint" v-if="currentWord.sentence">{{ maskedSentence }}</p>

      <!-- 手写（默认）：写完点「对答案」再自评对错 -->
      <template v-if="handwrite">
        <HandwritingPad ref="padRef" />
        <div v-if="!selfChecked" class="input-row pad-actions">
          <el-button type="primary" size="large" class="pad-check" :disabled="answered" @click="revealForSelfCheck">
            对答案
          </el-button>
        </div>
        <div v-else-if="!answered" class="self-check">
          <p class="answer-line">答案：<strong class="answer-word">{{ currentWord.word }}</strong></p>
          <div class="self-buttons">
            <el-button class="self-btn self-right" @click="selfJudge(true)">✅ 我写对了</el-button>
            <el-button class="self-btn self-wrong" @click="selfJudge(false)">❌ 我写错了</el-button>
          </div>
        </div>
      </template>

      <!-- 键盘：自动判分 -->
      <div v-else class="input-row">
        <el-input ref="inputRef" v-model="userInput" placeholder="输入英文单词..." size="large" :disabled="answered" @keyup.enter="checkAnswer" />
        <el-button type="primary" size="large" :disabled="!userInput || answered" @click="checkAnswer">确认</el-button>
      </div>

      <div v-if="answered" class="spelling-result">
        <div :class="correctFlag ? 'result-correct' : 'result-wrong'">
          <span v-if="correctFlag">✅ 正确！</span>
          <span v-else>❌ 正确答案：<strong>{{ currentWord.word }}</strong></span>
        </div>
        <p v-if="!correctFlag" class="retry-hint">这个词本轮最后会再出现一次</p>
        <el-button type="primary" @click="next" style="margin-top:12px;">{{ queue.length ? '下一题' : '完成' }}</el-button>
      </div>
    </div>

    <el-empty v-else-if="loading" description="加载中..." />
    <template v-else-if="totalCount > 0">
      <Fireworks :active="showFireworks" />
      <el-empty description="今日任务完成！">
        <div class="encouragement">
          <p class="encourage-main">{{ encouragement }}</p>
          <p class="encourage-extra">{{ extra }}</p>
        </div>
        <el-button type="primary" @click="$emit('done')">返回</el-button>
      </el-empty>
    </template>
    <el-empty v-else description="今天还没有可拼写的单词">
      <el-button type="primary" @click="$emit('done')">返回</el-button>
    </el-empty>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useWordStore } from '../stores/wordStore'
import { useSpeech } from '../composables/useSpeech'
import { playCorrect, playWrong, playFinish } from '../composables/useSound'
import HandwritingPad from './HandwritingPad.vue'
import Fireworks from './Fireworks.vue'
import { MAIN_ENCOURAGEMENT, pickExtra } from '../utils/encouragement'
import { todayStr } from '../utils/profile'

const props = defineProps({ bookId: { type: [Number, String], default: 0 } })
const emit = defineEmits(['done'])
const { speak } = useSpeech()

const wordStore = useWordStore()
const queue = ref([])
const currentWord = ref(null)
const userInput = ref('')
const answered = ref(false)
const correctFlag = ref(false)
const selfChecked = ref(false)
const handwrite = ref(true)
const showFireworks = ref(false)
const doneCount = ref(0)
const totalCount = ref(0)
const loading = ref(false)
const inputRef = ref(null)
const padRef = ref(null)
let requeued = new Set()

const progressPct = computed(() => totalCount.value
  ? Math.min(100, Math.round((doneCount.value / totalCount.value) * 100))
  : 0)

const encouragement = MAIN_ENCOURAGEMENT
const extra = pickExtra(todayStr())

/** 答之前把例句里的目标词遮掉，不然直接照着抄袭；答完再显示原句 */
const maskedSentence = computed(() => {
  const w = currentWord.value
  if (!w || !w.sentence) return ''
  if (answered.value) return `例句：${w.sentence}`
  const stem = String(w.word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return `语境：${w.sentence.replace(new RegExp(`\\b${stem}\\w*`, 'gi'), '____')}`
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
  selfChecked.value = false
  correctFlag.value = false
  showFireworks.value = false
  loading.value = false
  advance()
}

function advance() {
  answered.value = false
  selfChecked.value = false
  correctFlag.value = false
  userInput.value = ''
  currentWord.value = queue.value.shift() || null
  nextTick(() => {
    padRef.value?.clear()
    if (!handwrite.value) inputRef.value?.focus()
  })
}

/** 手写走自评：先看答案，再由学生自己判对错（本地没有手写识别） */
function revealForSelfCheck() {
  if (answered.value) return
  if (padRef.value?.isEmpty !== false) {
    ElMessage.warning('先在框里把单词写出来，再点「对答案」')
    return
  }
  selfChecked.value = true
}

function selfJudge(ok) {
  if (answered.value) return
  finish(!!ok)
}

function checkAnswer() {
  if (!userInput.value || answered.value || !currentWord.value) return
  finish(userInput.value.trim().toLowerCase() === currentWord.value.word.toLowerCase())
}

function finish(ok) {
  answered.value = true
  doneCount.value++
  const word = currentWord.value
  if (ok) {
    wordStore.markRight(word.id)
    speak(word.word)
    playCorrect(0)
  } else {
    wordStore.markWrong(word.id)
    playWrong()
    if (!requeued.has(word.id)) {
      requeued.add(word.id)
      queue.value.push(word)
      totalCount.value = doneCount.value + queue.value.length
    }
  }
  correctFlag.value = ok
}

function next() {
  advance()
  if (!currentWord.value) {
    ElMessage.success(MAIN_ENCOURAGEMENT)
    showFireworks.value = true
    playFinish()
  }
}
</script>

<style scoped>
.spelling-mode { max-width: 520px; margin: 0 auto; }
.spelling-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; }
.mode-badge { font-weight: 600; font-size: 15px; }
.spelling-progress { font-size: 14px; color: var(--color-text-muted); }
.spelling-card { background: white; border-radius: var(--radius-xl); padding: 32px; margin-top: 20px; box-shadow: var(--shadow-md); text-align: center; }
.spelling-hint { font-size: 14px; color: var(--color-text-muted); margin-bottom: 16px; }
.mean-display { font-size: 22px; font-weight: 600; color: var(--color-text); margin-bottom: 8px; }
.sentence-hint { font-size: 13px; color: var(--color-text-muted); font-style: italic; margin-bottom: 20px; }
.handwrite-toggle { font-size: 12px; color: var(--color-primary); }
.pad-actions { margin-top: 14px; justify-content: center; }
.pad-check { min-width: 160px; }
.self-check { margin-top: 14px; }
.answer-line { font-size: 15px; color: var(--color-text-secondary); margin-bottom: 10px; }
.answer-word { font-size: 24px; color: var(--color-primary); letter-spacing: 1px; }
.self-buttons { display: flex; gap: 10px; justify-content: center; }
.self-btn { border-radius: var(--radius-md) !important; min-width: 120px; height: 40px; }
.self-right { background: #F0FDF4 !important; color: #16A34A !important; border-color: #86EFAC !important; }
.self-wrong { background: #FEF2F2 !important; color: #DC2626 !important; border-color: #FCA5A5 !important; }
.input-row { display: flex; gap: 8px; }
.spelling-result { margin-top: 20px; }
.result-correct { color: #16A34A; font-weight: 600; font-size: 16px; }
.result-wrong { color: #DC2626; font-weight: 600; font-size: 16px; }
.retry-hint { margin-top: 4px; font-size: 12px; color: var(--color-text-muted); }
.encouragement { margin-bottom: 16px; }
.encourage-main { font-size: 17px; font-weight: 600; color: var(--color-primary); line-height: 1.6; }
.encourage-extra { margin-top: 6px; font-size: 14px; color: var(--color-text-muted); }
@media (max-width: 640px) {
  .spelling-card { padding: 20px; }
  .mean-display { font-size: 18px; }
}
</style>
