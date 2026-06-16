<template>
  <div class="stats-page">
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

    <!-- 学习建议 -->
    <el-card shadow="hover" class="tip-card">
      <template #header>
        <span>💡 学习建议</span>
      </template>
      <div v-if="stats.todayLearned === 0">
        今天还没有学习，开始今天的复习计划吧！
      </div>
      <div v-else-if="stats.wrongWordsCount > stats.totalWords * 0.3">
        错题较多，建议先复习错题本再学新词。
      </div>
      <div v-else-if="stats.streakDays >= 7">
        已连续学习 {{ stats.streakDays }} 天，保持住！
      </div>
      <div v-else>
        今日已学 {{ stats.todayLearned }} 词，继续加油！
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, nextTick, computed } from 'vue'
import { Chart, registerables } from 'chart.js'
import { useStatsStore } from '../stores/statsStore'
import { useChart } from '../composables/useChart'

// 注册 Chart.js 所有组件
Chart.register(...registerables)

const stats = useStatsStore()

const overviewCards = computed(() => [
  { label: '总单词', value: stats.totalWords, color: 'var(--color-primary)', sub: `已学 ${stats.learnedWords}` },
  { label: '已掌握', value: stats.learnedWords, color: 'var(--color-success)', sub: `掌握率 ${stats.masteryRate}%` },
  { label: '待复习', value: stats.totalWords - stats.learnedWords, color: 'var(--color-warning)', sub: '含新词' },
  { label: '连续学习', value: `${stats.streakDays}天`, color: 'var(--color-danger)', sub: `今日 ${stats.todayLearned} 词` }
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

onMounted(() => {
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
.tip-card {
  margin-top: 0;
}

/* 移动端响应式 */
@media (max-width: 640px) {
  .overview-value { font-size: 22px; }
  .chart-container { height: 200px; }
}
</style>
