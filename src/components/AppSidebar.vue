<template>
  <el-aside width="200px" class="app-sidebar">
    <div class="sidebar-header">
      <span class="logo-icon">📖</span>
      <span class="app-title">单词复习</span>
    </div>

    <el-menu
      :default-active="currentRoute"
      mode="vertical"
      class="sidebar-menu"
      @select="handleSelect"
    >
      <el-menu-item
        v-for="item in menuItems"
        :key="item.path"
        :index="item.path"
      >
        <el-icon>
          <component :is="item.icon" />
        </el-icon>
        <span>{{ item.title }}</span>
      </el-menu-item>
    </el-menu>

    <div class="sidebar-footer">
      <span class="version-text">v2.0</span>
    </div>
  </el-aside>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const currentRoute = computed(() => route.path)

function handleSelect(index) {
  if (index !== route.path) {
    router.push(index)
  }
}

const menuItems = [
  { path: '/', title: '首页', icon: 'House' },
  { path: '/books', title: '单词管理', icon: 'DocumentAdd' },
  { path: '/study', title: '开始背诵', icon: 'Reading' },
  { path: '/wrong', title: '错题本', icon: 'Warning' },
  { path: '/stats', title: '学习统计', icon: 'DataAnalysis' }
]
</script>

<style scoped>
.app-sidebar {
  background: white;
  border-right: 1px solid var(--color-border);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  font-size: 22px;
}

.app-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text);
}

.sidebar-menu {
  flex: 1;
  padding: 8px 0;
  border-right: none;
}

.sidebar-menu .el-menu-item {
  margin: 2px 8px;
  border-radius: var(--radius-md);
  font-size: 14px;
  transition: all var(--transition-fast);
}

.sidebar-menu .el-menu-item:hover {
  background: #F1F5F9;
}

.sidebar-menu .el-menu-item.is-active {
  color: var(--color-primary) !important;
  background: rgba(74, 108, 247, 0.08) !important;
  font-weight: 500;
}

.sidebar-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
  text-align: center;
}

.version-text {
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>
