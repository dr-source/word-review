import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { Storage, DB_KEYS } from './utils/storage'

// 初始化 localStorage 的个人数据键
if (!Storage.get(DB_KEYS.LEARN_RECORD)) Storage.set(DB_KEYS.LEARN_RECORD, {})
if (!Storage.get(DB_KEYS.WRONG_WORDS)) Storage.set(DB_KEYS.WRONG_WORDS, [])

const app = createApp(App)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.mount('#app')
