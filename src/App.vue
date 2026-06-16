<template>
  <el-container class="app-layout">
    <!-- 侧边导航（桌面端） -->
    <AppSidebar class="desktop-sidebar" />

    <!-- 主内容区 -->
    <el-main class="app-main">
      <router-view v-slot="{ Component, route: r }">
        <component :is="Component" :key="r.fullPath" />
      </router-view>
    </el-main>

    <!-- 底部导航（移动端） -->
    <nav class="mobile-bottom-nav">
      <router-link
        v-for="item in mobileMenu"
        :key="item.path"
        :to="item.path"
        class="mobile-nav-item"
        :class="{ active: route.path === item.path }"
      >
        <el-icon :size="20">
          <component :is="item.icon" />
        </el-icon>
        <span class="mobile-nav-label">{{ item.label }}</span>
      </router-link>
    </nav>
  </el-container>
</template>

<script setup>
import { useRoute } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'

const route = useRoute()

const mobileMenu = [
  { path: '/', label: '首页', icon: 'House' },
  { path: '/study', label: '背诵', icon: 'Reading' },
  { path: '/books', label: '词本', icon: 'DocumentAdd' },
  { path: '/wrong', label: '错题', icon: 'Warning' },
  { path: '/stats', label: '统计', icon: 'DataAnalysis' }
]
</script>

<style>
@import './styles/variables.css';

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: 100%;
  overflow-x: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-layout {
  min-height: 100vh;
  width: 100%;
  max-width: 100%;
}

.app-main {
  background: var(--color-bg);
  padding: 20px;
  min-height: 100vh;
  padding-bottom: 80px; /* 给底部导航留空间 */
  width: 100%;
  max-width: 100%;
}

/* 移动端：更紧凑的内边距 */
@media (max-width: 640px) {
  .app-main {
    padding: 12px;
    padding-bottom: 70px;
  }
  /* 所有页面容器在移动端全宽 */
  .home-page,
  .stats-page,
  .wrong-page,
  .study-page {
    max-width: 100% !important;
  }
}

/* 手机端独立样式覆盖（< 640px） */
@media (max-width: 640px) {
  /* 表单：标签在上方，输入框全宽 */
  .el-form-item {
    flex-wrap: wrap;
    margin-bottom: 10px !important;
  }
  .el-form-item__label {
    width: 100% !important;
    justify-content: flex-start !important;
    padding: 0 0 2px !important;
    line-height: 1.4 !important;
  }
  .el-form-item__content {
    width: 100% !important;
    margin-left: 0 !important;
  }
  /* 表格：允许横向滚动 */
  .el-table {
    width: 100%;
    overflow-x: auto;
    display: block;
  }
  .el-table__body-wrapper {
    overflow-x: auto;
  }
  /* 按钮组：允许换行 */
  .el-radio-group { flex-wrap: wrap; }
  .rating-buttons { flex-wrap: wrap; }
  .rating-btn { flex: 1; min-width: 80px !important; }
  /* 卡片：减少内边距 */
  .el-card__body { padding: 14px !important; }
}

/* 桌面端（≥ 1024px 才显示侧栏，平板竖屏用底部导航） */
.desktop-sidebar {
  display: none;
}

@media (min-width: 1024px) {
  .desktop-sidebar {
    display: flex;
  }
  .app-main {
    padding-bottom: 20px;
  }
}

/* 底部导航（移动端） */
.mobile-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: white;
  border-top: 1px solid var(--color-border);
  padding: 6px 0;
  padding-bottom: env(safe-area-inset-bottom, 6px);
  z-index: 1000;
}

@media (min-width: 1024px) {
  .mobile-bottom-nav {
    display: none;
  }
}

.mobile-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-decoration: none;
  color: var(--color-text-muted);
  padding: 6px 0 4px;
  transition: color var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.mobile-nav-item.active {
  color: var(--color-primary);
}

.mobile-nav-label {
  font-size: 10px;
  font-weight: 500;
}

/* 全局：防止任何元素溢出 */
#app {
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
}

/* Element Plus 覆盖 */
.el-card {
  border-radius: var(--radius-lg) !important;
  border: 1px solid var(--color-border) !important;
  box-shadow: var(--shadow-sm) !important;
}
.el-card__header {
  padding: 14px 18px !important;
  font-weight: 600;
  font-size: 15px;
}
.el-button--primary {
  --el-button-bg-color: var(--color-primary);
  --el-button-border-color: var(--color-primary);
  --el-button-hover-bg-color: var(--color-primary-light);
  --el-button-hover-border-color: var(--color-primary-light);
}
.el-menu { border-right: none !important; }
.el-menu-item.is-active {
  color: var(--color-primary) !important;
  background-color: rgba(74, 108, 247, 0.08) !important;
}
.el-statistic { text-align: center; }
.el-statistic .el-statistic__head { color: var(--color-text-muted); margin-bottom: 4px; }
.el-statistic .el-statistic__number {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
}
</style>
