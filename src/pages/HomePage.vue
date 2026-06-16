<template>
  <div class="home-page">
    <!-- 欢迎区域 -->
    <div class="welcome-section">
      <div class="welcome-text">
        <h1 class="greeting">📚 今天想学点什么？</h1>
        <p class="subtitle">当前词本：<strong>{{ bookStore.currentBook.name || '暂无' }}</strong></p>
      </div>
      <div class="progress-ring">
        <svg viewBox="0 0 120 120" class="ring-svg">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#E2E8F0" stroke-width="8" />
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            stroke="var(--color-primary)"
            stroke-width="8"
            stroke-linecap="round"
            :stroke-dasharray="ringCircumference"
            :stroke-dashoffset="ringOffset"
            transform="rotate(-90, 60, 60)"
            class="ring-progress"
          />
          <text x="60" y="52" text-anchor="middle" class="ring-number">{{ stats.todayLearned }}</text>
          <text x="60" y="72" text-anchor="middle" class="ring-label">今日学过</text>
        </svg>
      </div>
    </div>

    <!-- 统计卡片网格 -->
    <el-row :gutter="16" class="stats-grid">
      <el-col :xs="12" :sm="6" v-for="item in statCards" :key="item.label">
        <el-card shadow="hover" class="stat-card" :body-style="{ padding: '16px' }">
          <div class="stat-card-inner">
            <div class="stat-icon" :style="{ background: item.bg }">
              <el-icon :size="20"><component :is="item.icon" /></el-icon>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ item.value }}</span>
              <span class="stat-label">{{ item.label }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 快速操作 -->
    <el-row :gutter="16" class="quick-actions">
      <el-col :span="12">
        <el-card shadow="hover" class="action-card" @click="goStudy">
          <div class="action-card-content">
            <el-icon :size="32" color="var(--color-primary)"><Reading /></el-icon>
            <div>
              <div class="action-title">开始背诵</div>
              <div class="action-desc">继续今天的复习任务</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" class="action-card" @click="goBooks">
          <div class="action-card-content">
            <el-icon :size="32" color="var(--color-success)"><DocumentAdd /></el-icon>
            <div>
              <div class="action-title">添加单词</div>
              <div class="action-desc">录入新词或批量导入</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 掌握度分布条 -->
    <el-card shadow="hover" class="level-card">
      <template #header>
        <span>单词掌握分布</span>
      </template>
      <div class="level-bars">
        <div class="level-bar-row" v-for="level in levelLabels" :key="level.key">
          <span class="level-label">{{ level.label }}</span>
          <div class="level-bar-track">
            <div
              class="level-bar-fill"
              :style="{
                width: barPercent(level.key) + '%',
                background: level.color
              }"
            />
          </div>
          <span class="level-count">{{ stats.levelDistribution[level.key] }}</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBookStore } from '../stores/bookStore'
import { useWordStore } from '../stores/wordStore'
import { useStatsStore } from '../stores/statsStore'

const router = useRouter()
const bookStore = useBookStore()
const wordStore = useWordStore()
const stats = useStatsStore()

const RING_CIRCUMFERENCE = 2 * Math.PI * 54
const DAILY_GOAL = 20

const ringOffset = computed(() => {
  const progress = Math.min(stats.todayLearned / DAILY_GOAL, 1)
  return RING_CIRCUMFERENCE * (1 - progress)
})

const statCards = computed(() => [
  { label: '待复习', value: wordStore.reviewCount, icon: 'Clock', bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' },
  { label: '总单词', value: stats.totalWords, icon: 'Notebook', bg: 'rgba(74,108,247,0.12)', color: '#4A6CF7' },
  { label: '已掌握', value: stats.learnedWords, icon: 'CircleCheck', bg: 'rgba(34,197,94,0.12)', color: '#22C55E' },
  { label: '连续天数', value: stats.streakDays, icon: 'Fire', bg: 'rgba(239,68,68,0.12)', color: '#EF4444' }
])

const levelLabels = [
  { key: 0, label: '未学习', color: '#E2E8F0' },
  { key: 1, label: 'Lv.1-2 初学', color: '#F59E0B' },
  { key: 3, label: 'Lv.3-4 巩固', color: '#4A6CF7' },
  { key: 5, label: 'Lv.5-7 掌握', color: '#22C55E' }
]

function barPercent(levelGroup) {
  if (!stats.totalWords) return 0
  if (levelGroup === 0) {
    const count = stats.levelDistribution[0]
    return (count / stats.totalWords) * 100
  }
  if (levelGroup === 1) {
    const count = (stats.levelDistribution[1] || 0) + (stats.levelDistribution[2] || 0)
    return (count / stats.totalWords) * 100
  }
  if (levelGroup === 3) {
    const count = (stats.levelDistribution[3] || 0) + (stats.levelDistribution[4] || 0)
    return (count / stats.totalWords) * 100
  }
  if (levelGroup === 5) {
    const count = (stats.levelDistribution[5] || 0) + (stats.levelDistribution[6] || 0) + (stats.levelDistribution[7] || 0)
    return (count / stats.totalWords) * 100
  }
  return 0
}

onMounted(() => {
  if (!bookStore.bookList.length) bookStore.loadBooks()
  if (bookStore.currentBookId) {
    wordStore.loadWords(bookStore.currentBookId)
  }
})

function goStudy() { router.push('/study') }
function goBooks() { router.push('/books') }
</script>

<style scoped>
.home-page {
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}

/* 欢迎区域 */
.welcome-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.greeting {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 4px;
}
.subtitle {
  color: var(--color-text-secondary);
  font-size: 15px;
}
.subtitle strong {
  color: var(--color-primary);
}

/* 进度圆环 */
.ring-svg {
  width: 100px;
  height: 100px;
}
.ring-progress {
  transition: stroke-dashoffset 0.6s ease;
}
.ring-number {
  font-size: 24px;
  font-weight: 700;
  fill: var(--color-text);
}
.ring-label {
  font-size: 11px;
  fill: var(--color-text-muted);
}

/* 统计卡片 */
.stats-grid {
  margin-bottom: 16px !important;
}
.stat-card {
  cursor: default;
  transition: transform var(--transition-normal), box-shadow var(--transition-normal);
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md) !important;
}
.stat-card-inner {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-info {
  display: flex;
  flex-direction: column;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}
.stat-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

/* 快速操作 */
.quick-actions {
  margin-bottom: 16px !important;
}
.action-card {
  cursor: pointer;
  transition: transform var(--transition-normal), box-shadow var(--transition-normal);
}
.action-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md) !important;
}
.action-card-content {
  display: flex;
  align-items: center;
  gap: 14px;
}
.action-title {
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 2px;
}
.action-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}

/* 掌握度分布 */
.level-card {
  margin-bottom: 24px;
}
.level-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.level-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.level-label {
  width: 80px;
  font-size: 13px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.level-bar-track {
  flex: 1;
  height: 8px;
  background: #F1F5F9;
  border-radius: var(--radius-full);
  overflow: hidden;
}
.level-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.6s ease;
}
.level-count {
  width: 30px;
  text-align: right;
  font-size: 13px;
  color: var(--color-text-muted);
}

/* 移动端响应式 */
@media (max-width: 640px) {
  .home-page { max-width: 100%; }
  .welcome-section {
    flex-direction: column;
    text-align: center;
    gap: 12px;
  }
  .greeting {
    font-size: 22px;
  }
  .ring-svg {
    width: 80px;
    height: 80px;
  }
  .ring-number { font-size: 20px; }
  .stat-value { font-size: 18px; }
  .action-card-content { gap: 10px; }
  .level-label { width: 60px; font-size: 12px; }
}
</style>
