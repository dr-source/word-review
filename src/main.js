import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { initDefaultData } from './utils/word'
import { ensureDefaultStudent } from './utils/profile'

// 初始化默认数据（示例词本 + 单词）
initDefaultData()
// 确保存在当前学生档案：所有 store 读取数据前必须先就绪
ensureDefaultStudent()

const app = createApp(App)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.mount('#app')
