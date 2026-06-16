import { createRouter, createWebHashHistory } from 'vue-router'

// 带重试的动态导入
function withRetry(importFn) {
  let retries = 0
  const maxRetries = 3
  return () => {
    return importFn().catch((err) => {
      retries++
      if (retries < maxRetries) {
        console.warn(`[router] 加载失败，第 ${retries} 次重试...`)
        return new Promise((resolve) => setTimeout(resolve, 500)).then(() => {
          return importFn().catch((e) => { throw e })
        })
      }
      throw err
    })
  }
}

const routes = [
  {
    path: '/',
    component: withRetry(() => import('../pages/HomePage.vue')),
    meta: { title: '首页', icon: 'House' }
  },
  {
    path: '/books',
    component: withRetry(() => import('../pages/BookManagePage.vue')),
    meta: { title: '单词管理', icon: 'DocumentAdd' }
  },
  {
    path: '/study',
    component: withRetry(() => import('../pages/StudyPage.vue')),
    meta: { title: '开始背诵', icon: 'Reading' }
  },
  {
    path: '/wrong',
    component: withRetry(() => import('../pages/WrongBookPage.vue')),
    meta: { title: '错题本', icon: 'Warning' }
  },
  {
    path: '/stats',
    component: withRetry(() => import('../pages/StatsPage.vue')),
    meta: { title: '学习统计', icon: 'DataAnalysis' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 路由守卫：非管理员访问 /books 跳转到首页
router.beforeEach((to) => {
  if (to.path === '/books') {
    const isAdmin = localStorage.getItem('word_review_admin') === 'true'
    if (!isAdmin) return '/'
  }
})

router.onError((err) => {
  console.error('[router] 导航错误:', err)
})

export default router
