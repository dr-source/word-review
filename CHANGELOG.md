# 📖 单词复习系统 — 变更日志

> 基于 Vue 3 + Element Plus + Supabase 的艾宾浩斯记忆曲线单词复习工具

---

## 功能总览

| 功能 | 说明 |
|------|------|
| ✅ 三种学习模式 | 翻卡背诵、选择题、拼写练习 |
| ✅ 艾宾浩斯复习 | 自动计算复习间隔（5分→30分→1天→2天→4天→7天→15天） |
| ✅ 三档评价 | 不认识 / 模糊 / 认识，精细控制记忆曲线 |
| ✅ 键盘快捷键 | 空格显示答案，1/2/3 快速评价 |
| ✅ 云端共享 | Supabase 存储词本和单词，所有人数据同步 |
| ✅ 个人进度 | 学习记录、错题本、掌握等级存在本地浏览器 |
| ✅ 批量导入 | 支持 Excel / CSV / TXT，自动识别列名 |
| ✅ 数据导出 | JSON 格式备份和恢复 |
| ✅ 管理员模式 | 单词管理默认隐藏，5 次点击标题解锁 |
| ✅ 响应式布局 | 手机底部导航、平板/桌面侧栏、触摸手势 |
| ✅ 本地缓存 | localStorage 缓存，首次加载后秒开 |
| ✅ PWA 支持 | 可添加到手机主屏幕（manifest.json） |

---

## 各阶段变更

### Phase 1：基础修复

| 问题 | 修复 |
|------|------|
| `<el-list>` 组件不存在 | 替换为 `<ul>` + scoped CSS |
| `<el-card title>` 无效 | 改为 `header` prop |
| Chart.js 内存泄漏 | 存实例变量，`onUnmounted` 销毁 |
| 无初始数据 | `initDefaultData()` 预置 25 个示例单词 |
| 首页待复习数总为 0 | 合并计算新词 + 待复习词 |
| 废弃 API | `readAsBinaryString` → `readAsArrayBuffer` |

### Phase 2：架构拆分

- 351 行单文件 App.vue → 路由 + Pinia + 组件化
- 5 个页面组件（首页/词本管理/背诵/错题本/统计）
- 5 个可复用组件（侧栏/翻卡/选择题/拼写/导入弹窗）
- 3 个 composable（Chart/语音/触摸手势）
- Vue Router 懒加载，按需加载页面 chunk

### Phase 3：UI Redesign

- 全局设计系统（CSS 变量：配色/圆角/阴影/间距）
- 首页仪表盘（进度圆环 + 统计卡片 + 掌握度分布条）
- 翻卡 3D 动画 + 三档评价按钮
- 页面切换过渡动画
- 响应式断点（手机 < 640px / 平板 640-1024px / 桌面 > 1024px）
- 手机底部 5 Tab 导航

### Phase 4：功能增强

| 功能 | 详情 |
|------|------|
| 选择题模式 | 看词选义，4 选项，自动判对错 |
| 拼写模式 | 看释义打字，自动判对错 + 发音 |
| 内置词典 | 300 常用词，输入时自动查词填充 |
| 每日学习追踪 | 自动记录每日学习数，连续天数统计 |
| 数据导入导出 | JSON 完整备份和恢复 |
| 搜索筛选 | 词本内搜索、掌握度标签 |
| 键盘快捷键 | 空格翻卡，1/2/3 快捷评价 |

### Phase 5：移动端 + PWA

- PWA manifest.json（添加到主屏幕）
- 响应式布局（底部导航、全宽卡片、触摸目标 44px+）
- 触摸滑动手势（左滑不认识、右滑认识、上滑发音）

### Supabase 云端化

- 词本和单词 → 云端 Supabase 存储，所有人共享
- 个人进度（掌握等级、错题本、学习记录）→ 本地 localStorage
- 首次打开从 localStorage 缓存秒开，后台自动刷新
- 增删操作实时更新词数，不依赖全量统计

### 管理员模式

- 默认隐藏"单词管理"页面
- 快速点击标题"📖 单词复习" 5 次解锁
- 侧栏底部显示"管理员"标签，点击退出
- 路由守卫防止直接 URL 访问

---

## 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 (Composition API) | UI 框架 |
| Vite 5 | 构建工具 |
| Element Plus 2.x | 组件库 |
| Pinia 3 | 状态管理 |
| Vue Router 4 | 路由 |
| Chart.js 4 | 图表 |
| Supabase | 云端数据库 |
| Web Speech API | 单词发音 |
| XLSX | Excel 导入 |

## 文件结构

```
src/
  App.vue                  # 布局壳 + 底部导航
  main.js                  # 入口
  router/index.js          # 路由 + 守卫
  stores/
    authStore.js           # 管理员模式
    bookStore.js           # 词本状态 + 缓存
    wordStore.js           # 单词状态 + 学习调度
    statsStore.js          # 统计数据
  pages/
    HomePage.vue           # 首页仪表盘
    BookManagePage.vue     # 词本管理（管理员）
    StudyPage.vue          # 背诵页面（模式选择）
    WrongBookPage.vue      # 错题本
    StatsPage.vue          # 学习统计 + 图表
  components/
    AppSidebar.vue         # 侧栏导航
    FlashcardMode.vue      # 翻卡模式
    QuizMode.vue           # 选择题模式
    SpellingMode.vue       # 拼写模式
    ImportDialog.vue       # 批量导入弹窗
  composables/
    useChart.js            # Chart.js 生命周期
    useSpeech.js           # TTS 封装
    useTouchSwipe.js       # 触摸手势
  utils/
    supabase.js            # Supabase 客户端
    storage.js             # localStorage 封装
    word.js                # 单词数据工具
    dictionary.js          # 内置词典（300 词）
  styles/
    variables.css          # 设计系统变量
```
