<template>
  <div class="syllable-mode">
    <div class="syllable-header">
      <span class="mode-badge">🎵 音节拼读</span>
      <span class="syllable-progress">{{ index + 1 }}/{{ total }}</span>
    </div>

    <div class="syllable-card" v-if="current">
      <p class="syllable-word">{{ current.word }}</p>
      <p class="syllable-mean">{{ current.mean }}</p>

      <div class="syllable-line" v-if="syllables.length">
        <span
          v-for="(part, i) in syllables"
          :key="i"
          class="syllable-chip"
          :class="{ 'is-stressed': i === stressIdx }"
        >
          {{ part }}
          <span v-if="i === stressIdx" class="stress-mark">重读</span>
        </span>
      </div>
      <p class="syllable-empty" v-else>这个词没有音标，先听一听再跟读</p>

      <p class="syllable-phonetic" v-if="current.phonetic">{{ current.phonetic }}</p>

      <div class="syllable-actions">
        <el-button class="syllable-listen" type="primary" @click="speakWord">
          🔊 听发音
        </el-button>
        <el-button class="syllable-slow" @click="speakSlow">🐢 慢速</el-button>
      </div>

      <p class="syllable-tip">
        先按「·」把音标切成 {{ syllables.length || 1 }} 个音节，一拍一拍读出来；带「重读」的那一拍读得重、读得长，其余音节读轻。
      </p>
    </div>

    <div class="syllable-nav" v-if="total > 0">
      <el-button :disabled="index === 0" @click="prev">上一个</el-button>
      <el-button :disabled="index >= total - 1" type="primary" @click="next">下一个</el-button>
    </div>
    <el-empty v-else description="今天还没有单词" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useWordStore } from '../stores/wordStore'
import { splitSyllables, stressedSyllable } from '../utils/syllable'
import { useSpeech } from '../composables/useSpeech'

const props = defineProps({ bookId: { type: [Number, String], default: 0 } })

const wordStore = useWordStore()
const { speak } = useSpeech()
const index = ref(0)

const words = computed(() => wordStore.taskWords)
const total = computed(() => words.value.length)
const current = computed(() => words.value[index.value] || null)
const syllables = computed(() => (current.value ? splitSyllables(current.value.phonetic) : []))
const stressIdx = computed(() => (current.value ? stressedSyllable(current.value.phonetic) : -1))

watch(() => props.bookId, async (id) => {
  if (!id) return
  await wordStore.loadWords(id)
  wordStore.ensureDailyTask(id)
  index.value = 0
}, { immediate: true })

function speakWord() {
  if (current.value) speak(current.value.word)
}

/** 慢速：把单词拆成音节逐个读，帮学生听清每一拍 */
function speakSlow() {
  if (!current.value) return
  speak(current.value.word, false, 0.5)
}

function prev() {
  if (index.value > 0) index.value--
}

function next() {
  if (index.value < total.value - 1) index.value++
}
</script>

<style scoped>
.syllable-mode { max-width: 560px; margin: 0 auto; }
.syllable-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.mode-badge { font-weight: 600; font-size: 15px; }
.syllable-progress { margin-left: auto; font-size: 14px; color: var(--color-text-muted); }
.syllable-card {
  padding: 28px 24px;
  background: white;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  text-align: center;
}
.syllable-word { font-size: 34px; font-weight: 700; color: var(--color-text); }
.syllable-mean { margin-top: 6px; font-size: 15px; color: var(--color-primary); line-height: 1.6; }
.syllable-line {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 22px;
}
.syllable-chip {
  position: relative;
  padding: 8px 14px 14px;
  border-radius: var(--radius-md);
  background: #F1F5F9;
  border: 1px solid var(--color-border);
  font-size: 20px;
  color: var(--color-text);
}
.syllable-chip.is-stressed {
  background: #FFFBEB;
  border-color: #FCD34D;
  color: #B45309;
  font-weight: 700;
  transform: translateY(-2px);
}
.stress-mark {
  position: absolute;
  left: 50%;
  bottom: 2px;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 600;
  color: #D97706;
  white-space: nowrap;
}
.syllable-empty { margin-top: 22px; font-size: 14px; color: var(--color-text-muted); }
.syllable-phonetic { margin-top: 14px; font-size: 15px; color: var(--color-text-muted); }
.syllable-actions { display: flex; justify-content: center; gap: 10px; margin-top: 20px; }
.syllable-tip {
  margin-top: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-muted);
  text-align: left;
}
.syllable-nav { display: flex; justify-content: space-between; margin-top: 16px; }
@media (max-width: 640px) {
  .syllable-card { padding: 20px 16px; }
  .syllable-word { font-size: 28px; }
  .syllable-chip { font-size: 17px; padding: 6px 10px 13px; }
}
</style>
