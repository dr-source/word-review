<template>
  <div class="spelling-mode">
    <div class="spelling-header">
      <span class="mode-badge">✏️ 拼写模式</span>
      <span class="spelling-progress">今日任务 {{ doneCount }}/{{ totalCount }}</span>
    </div>
    <el-progress :percentage="progressPct" :stroke-width="6" :show-text="false" color="#22C55E" />

    <div class="spelling-card" v-if="currentWord">
      <p class="spelling-hint">看中文释义，用下面的字母键拼出英文单词，写完自动判对错</p>
      <div class="mean-display">{{ currentWord.mean }}</div>
      <p class="sentence-hint" v-if="currentWord.sentence">{{ maskedSentence }}</p>

      <!-- 字母槽：写完自动判分，学生不能自评 -->
      <div class="spell-slots" :class="slotsClass">
        <span
          v-for="(s, i) in slots"
          :key="i"
          :class="s.type === 'letter' ? 'spell-slot' : 'spell-sep'"
        >{{ s.type === 'letter' ? (typed[s.index] || '') : '' }}</span>
      </div>

      <!-- 只有字母的键盘：不弹系统键盘，手机上也不会遮住单词 -->
      <div v-if="!answered" class="spell-keys">
        <div v-for="(row, r) in KEY_ROWS" :key="r" class="spell-key-row">
          <button v-for="k in row" :key="k" type="button" class="spell-key" @click="press(k)">{{ k }}</button>
        </div>
        <div class="spell-key-row">
          <button type="button" class="spell-key spell-del" @click="backspace">⌫ 删除</button>
        </div>
      </div>

      <div v-if="answered" class="spelling-result">
        <div :class="correctFlag ? 'result-correct' : 'result-wrong'">
          <span v-if="correctFlag">✅ 正确！</span>
          <span v-else>❌ 正确答案：<strong>{{ currentWord.word }}</strong></span>
        </div>
        <p v-if="!correctFlag" class="retry-hint">这个词稍后还会再出现一次</p>
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
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useWordStore } from '../stores/wordStore'
import { useSpeech } from '../composables/useSpeech'
import { playCorrect, playWrong, playFinish } from '../composables/useSound'
import Fireworks from './Fireworks.vue'
import { MAIN_ENCOURAGEMENT, pickExtra } from '../utils/encouragement'
import { todayStr } from '../utils/profile'

const KEY_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm']
]
// 拼错后重排到第 3 个位置：过两三题就再见到一遍，趁热记住
const RETRY_POS = 3

const props = defineProps({ bookId: { type: [Number, String], default: 0 } })
const emit = defineEmits(['done'])
const { speak } = useSpeech()

const wordStore = useWordStore()
const queue = ref([])
const currentWord = ref(null)
const typed = ref('')
const answered = ref(false)
const correctFlag = ref(false)
const showFireworks = ref(false)
const doneCount = ref(0)
const totalCount = ref(0)
const loading = ref(false)
let requeued = new Set()

const progressPct = computed(() => totalCount.value
  ? Math.min(100, Math.round((doneCount.value / totalCount.value) * 100))
  : 0)

const encouragement = MAIN_ENCOURAGEMENT
const extra = pickExtra(todayStr())

/** 只比字母，空格和连字符当固定分隔符处理（ice cream / e-mail 也能拼） */
const answerLetters = computed(() => (currentWord.value?.word || '').replace(/[^A-Za-z]/g, '').toLowerCase())

const slots = computed(() => {
  let letterIndex = 0
  return [...(currentWord.value?.word || '')].map(ch => {
    if (/[A-Za-z]/.test(ch)) return { type: 'letter', index: letterIndex++ }
    return { type: 'sep', index: -1 }
  })
})

const slotsClass = computed(() => {
  if (!answered.value) return ''
  return correctFlag.value ? 'is-right' : 'is-wrong'
})

/** 答之前把例句里的目标词遮掉，不然直接照着抄袭；答完再显示原句 */
const maskedSentence = computed(() => {
  const w = currentWord.value
  if (!w || !w.sentence) return ''
  if (answered.value) return `例句：${w.sentence}`
  const stem = String(w.word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return `语境：${w.sentence.replace(new RegExp(`\\b${stem}\\w*`, 'gi'), '____')}`
})

watch(() => props.bookId, async (id) => { if (id) await init(id) }, { immediate: true })

// 字母填满就自动判分：对错由软件算，学生没有自评的口子
watch(typed, (value) => {
  if (answered.value) return
  if (value.length !== answerLetters.value.length || !answerLetters.value) return
  finish(value === answerLetters.value)
})

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
  answered.value = false
  correctFlag.value = false
  showFireworks.value = false
  loading.value = false
  advance()
}

function advance() {
  answered.value = false
  correctFlag.value = false
  typed.value = ''
  currentWord.value = queue.value.shift() || null
}

function press(key) {
  if (answered.value || !currentWord.value) return
  if (typed.value.length >= answerLetters.value.length) return
  typed.value += key
}

function backspace() {
  if (answered.value) return
  typed.value = typed.value.slice(0, -1)
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
      queue.value.splice(Math.min(RETRY_POS, queue.value.length), 0, word)
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
.spell-slots { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; margin-bottom: 22px; }
.spell-slot {
  min-width: 30px; height: 44px; padding: 0 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; font-weight: 700; color: var(--color-text); text-transform: lowercase;
  border-bottom: 3px solid var(--color-border); border-radius: 4px 4px 0 0;
}
.spell-sep { min-width: 14px; height: 44px; display: flex; align-items: center; justify-content: center; color: var(--color-text-muted); font-size: 22px; }
.spell-sep::before { content: '·'; opacity: 0.35; }
.spell-slots.is-right .spell-slot { border-bottom-color: #22C55E; color: #16A34A; }
.spell-slots.is-wrong .spell-slot { border-bottom-color: #EF4444; color: #DC2626; }
.spell-keys { display: flex; flex-direction: column; gap: 6px; }
.spell-key-row { display: flex; justify-content: center; gap: 5px; }
.spell-key {
  flex: 1 1 0; min-width: 0; max-width: 44px; height: 44px;
  font-size: 16px; font-weight: 600; color: var(--color-text);
  background: #F8FAFC; border: 1px solid var(--color-border); border-radius: 8px;
  cursor: pointer; transition: all 0.12s ease; touch-action: manipulation;
}
.spell-key:active { background: var(--color-primary); color: white; transform: scale(0.96); }
.spell-del { flex: 0 0 108px; max-width: none; font-size: 14px; color: var(--color-text-secondary); }
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
  .spell-slot { min-width: 24px; height: 38px; font-size: 20px; }
  .spell-key { height: 40px; font-size: 15px; }
}
</style>
