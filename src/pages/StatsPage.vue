<template>
  <div class="stats-page">
    <!-- 学生抬头 -->
    <div class="page-header">
      <div>
        <h2 class="page-title">学习分析 · {{ stats.studentName }}</h2>
        <div class="page-sub">
          <el-tag v-if="bookStore.currentBook" size="small" effect="plain">{{ bookStore.currentBook.name }}</el-tag>
          <el-tag v-if="stats.taskSize" size="small" type="warning" effect="plain">
            今日任务 {{ stats.taskSize }} 词 · 完成 {{ stats.taskDoneRate }}%
          </el-tag>
        </div>
      </div>
      <el-button size="small" @click="router.push('/students')">切换学生</el-button>
    </div>

    <!-- 概览卡片 -->
    <el-row :gutter="16" class="stats-overview">
      <el-col :xs="12" :sm="6" v-for="item in overviewCards" :key="item.label">
        <el-card shadow="hover" class="overview-card" :body-style="{ padding: '20px' }">
          <div class="overview-value" :style="{ color: item.color }">{{ item.value }}</div>
          <div class="overview-label">{{ item.label }}</div>
          <div class="overview-sub" v-if="item.sub">{{ item.sub }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区 -->
    <el-row :gutter="16">
      <el-col :xs="24" :sm="12" class="chart-col">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="chart-header">
              <span>掌握度分布</span>
              <el-tag size="small" type="info">按记忆等级</el-tag>
            </div>
          </template>
          <div class="chart-container">
            <canvas id="levelChart"></canvas>
          </div>
          <!-- 等级说明 -->
          <div class="chart-legend">
            <span v-for="l in levelLegend" :key="l.label" class="legend-item">
              <span class="legend-dot" :style="{ background: l.color }"></span>
              {{ l.label }}
            </span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" class="chart-col">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="chart-header">
              <span>总体掌握率</span>
              <el-tag size="small" type="success">{{ stats.masteryRate }}%</el-tag>
            </div>
          </template>
          <div class="chart-container">
            <canvas id="masteryChart"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 高频错词 -->
    <el-card shadow="hover" class="wrong-card" v-if="stats.topWrongWords.length">
      <template #header>
        <div class="chart-header">
          <span>高频错词</span>
          <el-tag size="small" type="danger" effect="plain">{{ stats.wrongWordsCount }} 词</el-tag>
        </div>
      </template>
      <el-table :data="stats.topWrongWords" size="small" border stripe>
        <el-table-column prop="word" label="单词" width="140">
          <template #default="{ row }"><strong>{{ row.word }}</strong></template>
        </el-table-column>
        <el-table-column prop="mean" label="释义" min-width="180" />
        <el-table-column prop="count" label="错误次数" width="90" align="center" />
        <el-table-column label="最近错误" width="110" align="center">
          <template #default="{ row }">{{ row.lastAt ? new Date(row.lastAt).toLocaleDateString('zh-CN') : '-' }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 学习分析 -->
    <el-card shadow="hover" class="tip-card">
      <template #header>
        <span>{{ stats.studentName }} 的背记情况分析</span>
      </template>
      <p v-for="(line, i) in stats.analysisReport" :key="i" class="analysis-line">{{ line }}</p>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, nextTick, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Chart, registerables } from 'chart.js'
import { useStatsStore } from '../stores/statsStore'
import { useBookStore } from '../stores/bookStore'
import { useChart } from '../composables/useChart'

// 注册 Chart.js 所有组件
Chart.register(...registerables)

const router = useRouter()
const stats = useStatsStore()
const bookStore = useBookStore()

const overviewCards = computed(() => [
  { label: '总单词', value: stats.totalWords, color: 'var(--color-primary)', sub: `已学 ${stats.learnedWords}` },
  { label: '已掌握', value: stats.learnedWords, color: 'var(--color-success)', sub: `掌握率 ${stats.masteryRate}%` },
  { label: '待复习', value: stats.totalWords - stats.learnedWords, color: 'var(--color-warning)', sub: '含新词' },
  { label: '连续学习', value: `${stats.streakDays}天`, color: 'var(--color-danger)', sub: `今日 ${stats.todayUnique} 词` }
])

const levelLegend = [
  { label: '未学习(Lv.0)', color: '#E2E8F0' },
  { label: '初学(Lv.1-2)', color: '#F59E0B' },
  { label: '巩固(Lv.3-4)', color: '#4A6CF7' },
  { label: '掌握(Lv.5-7)', color: '#22C55E' }
]

const levelChart = useChart('levelChart', (canvas) => {
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Lv.0', 'Lv.1', 'Lv.2', 'Lv.3', 'Lv.4', 'Lv.5', 'Lv.6', 'Lv.7'],
      datasets: [{
        label: '单词数',
        data: stats.levelDistribution,
        backgroundColor: ['#E2E8F0', '#FDE68A', '#FCD34D', '#93C5FD', '#60A5FA', '#86EFAC', '#4ADE80', '#22C55E'],
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } },
        x: { ticks: { font: { size: 11 } } }
      }
    }
  })
})

const masteryChart = useChart('masteryChart', (canvas) => {
  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['已掌握', '学习中', '未学习'],
      datasets: [{
        data: [stats.learnedWords, stats.wrongWordsCount, Math.max(0, stats.totalWords - stats.learnedWords - stats.wrongWordsCount)],
        backgroundColor: ['#22C55E', '#F59E0B', '#E2E8F0'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 16, usePointStyle: true, font: { size: 12 } }
        }
      },
      cutout: '65%'
    }
  })
})

onMounted(async () => {
  await stats.loadStats(bookStore.currentBookId)
  nextTick(() => {
    levelChart.render()
    masteryChart.render()
  })
})
</script>

<style scoped>
.stats-page {
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.page-sub {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.stats-overview {
  margin-bottom: 16px !important;
}
.overview-card {
  text-align: center;
  transition: transform var(--transition-normal);
}
.overview-card:hover {
  transform: translateY(-2px);
}
.overview-value {
  font-size: 28px;
  font-weight: 700;
}
.overview-label {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
.overview-sub {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 4px;
}
.chart-col {
  margin-bottom: 16px;
}
.chart-container {
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.chart-legend {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.wrong-card {
  margin-bottom: 16px;
}
.tip-card {
  margin-top: 0;
}
.analysis-line {
  font-size: 13px;
  line-height: 1.8;
  color: var(--color-text-secondary);
  margin: 0 0 6px;
}
.analysis-line:last-child {
  margin-bottom: 0;
}

/* 移动端响应式 */
@media (max-width: 640px) {
  .overview-value { font-size: 22px; }
  .chart-container { height: 200px; }
}
</style>
