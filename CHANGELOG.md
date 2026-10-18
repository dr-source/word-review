# 📖 单词复习系统 — 变更日志

> 基于 Vue 3 + Element Plus + Supabase 的艾宾浩斯记忆曲线单词复习工具

---

## 功能总览

| 功能 | 说明 |
|------|------|
| ✅ 三种学习模式 | 翻卡背诵、选择题、拼写练习，抽查内容与顺序完全一致 |
| ✅ 艾宾浩斯复习 | 答对升一级，间隔 1→2→4→7→15→30→60 天滚动（模糊 30 分钟、不认识 5 分钟） |
| ✅ 三档评价 | 不认识 / 模糊 / 认识，精细控制记忆曲线 |
| ✅ 学生档案 | 每个学生一份独立记录（进度 / 错题 / 记录 / 任务），切换即换档案 |
| ✅ 每日任务 | 默认 33 词，到期复习优先 + 新词补齐，三模式共用同一批词 |
| ✅ 乱序抽查 | 当天固定乱序，三模式顺序一致，便于互相抽查 |
| ✅ 个性化分析 | 写有学生名字的背记情况分析 + 高频错词表 |
| ✅ 键盘快捷键 | 空格显示答案，1/2/3 快速评价 |
| ✅ 云端共享 | Supabase 存储词本和单词，所有人数据同步 |
| ✅ 个人进度 | 学习记录、错题本、掌握等级按学生存在本地浏览器 |
| ✅ 批量导入 | 支持 Excel / CSV / TXT，自动识别列名 |
| ✅ 数据导出 | JSON 格式备份和恢复 |
| ✅ 管理员模式 | 单词管理默认隐藏，5 次点击标题解锁 |
| ✅ 响应式布局 | 手机底部导航、平板/桌面侧栏、翻卡触屏手势（答案显示后右滑认识 / 左滑不认识 / 下滑模糊） |
| ✅ 多标签页同步 | 同一台电脑开多个标签页，进度与今日任务以 `storage` 事件同步，今日任务以后写入者为准 |
| ✅ 自动自测 | 逻辑自测 + 端到端自测（无头浏览器真点真滑）都在仓库里，push / PR 由 CI 执行 |
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

### Phase 6：学生档案 + 每日任务（本轮）

| 问题 | 修复 |
|------|------|
| 翻卡背记的内容和选择/拼写抽查的不一致 | 三种模式统一从当日任务 `wordStore.taskWords` 取词：翻卡=看词背释义，选择=看英文认中文，拼写=看中文写英文；顺序同源，乱序开关当天固定 |
| 抽查范围没有边界 | 新增「每日任务」：默认 33 词（5~100 可调），到期复习优先 + 新词补齐，三种模式都只抽当天任务 |
| 多个学生的记录互相累加，错题本分不清是谁的 | 新增学生档案 `src/utils/profile.js`：全部记录键加 `wr_<学生id>_` 前缀隔离；侧栏与档案页可切换学生，切换后整页重载读取对应档案；旧全局数据首次运行迁入「默认学生」 |
| 分析结果没有针对性 | `statsStore.analysisReport` 逐条生成带学生名字的分析（掌握率、今日任务完成度、剩余新词天数、高频错词、等级分布、连续天数建议）；统计页顶部标注学生与词本，并新增高频错词表 |
| 复习间隔不符合遗忘曲线 | `EBBINGHAUS = [1,2,4,7,15,30,60]` 天：答对升一级取下一档；模糊 30 分钟、不认识 5 分钟；同一天重复答对不再升级；错词会被插回当天队列滚动出现 |
| 错题本看不到错误情况 | 错题本新增「错误次数」「最近错误」两列，标题带当前学生名 |
| 学完一词后首页/背诵页的「今日任务 X/33」不跟着变 | `wordStore` 把今日已学 id 放进 `ref` 并在打分、生成任务时刷新，`taskDoneCount` 由它派生，跨页面立即同步 |
| 学完新词再进统计页，今日已学仍显示旧数字 | `statsStore.loadStats` 每次刷新版本号，各统计项 computed 读取该版本建立依赖，二次进入必然重算 |

新增文件：`src/utils/profile.js`、`src/stores/studentStore.js`、`src/pages/StudentsPage.vue`
改动文件：`wordStore / bookStore / statsStore`、`FlashcardMode / QuizMode / SpellingMode`、`StudyPage / HomePage / StatsPage / WrongBookPage`、`AppSidebar / App.vue`、`main.js / router/index.js`、`storage.js / supabase.js / word.js`

### Phase 7：并发与触屏收尾（本轮）

| 问题 | 修复 |
|------|------|
| 同一学生开两个标签页时，今日任务可能互相覆盖 | `ensureDailyTask` 写完立即回读，内存里始终是存储里的那一份；新增 `src/utils/sync.js` 监听 `storage` 事件，`App.vue` 收到别的标签页写入后调 `wordStore.syncFromStorage()`（进度 + 今日任务 + 每日任务量/乱序）与 `statsStore` 重算，今日任务**以后写入者为准**；学生档案键变化则整页重载，避免读到上一名学生的数据；正在背的这一轮队列不被打断 |
| 触屏滑动只是"文档里说有"，实际没有生效 | `useTouchSwipe` 重写为 `touchstart/touchmove/touchend` 三段判定（阈值 50px，方向需占优 1.2 倍，手势超过 1s 不计），绑到 `.flashcard-wrapper`；**答案未显示时四个方向都只翻面**，答案显示后右滑=认识、左滑=不认识、下滑=模糊、上滑不评分；`touchend` 后浏览器补发的 `click` 用 `justSwiped()` 吞掉，不会切到下一张就自动翻面 |
| 自测脚本在仓库外的临时目录，长期容易丢失 | 自测搬进 `tests/`：`logic.test.mjs`（逻辑，Node + 内存 localStorage）、`browser.test.mjs`（端到端，无头浏览器 + CDP 真点真滑，自带静态服务器）、`env.mjs` / `build-logic.mjs`（环境替身与打包）；新增 `npm run test:logic / test:e2e / test`；新增 `.github/workflows/test.yml`，push 与 PR 都跑 |

自测覆盖：逻辑自测 131 条断言（含「跨标签页：以后写入者为准，不丢更新」14 条），端到端自测 90 条断言（含双标签页同步 13 条、移动端触屏滑动 15 条 + 控制台无 error）。

修复的隐藏 bug：`useTouchSwipe` 在 `touchend` 里先把「刚滑动过」时间戳写好再触发回调，而 `onSwipeUp` 走的 `handleShowAnswer` 一进来就被这个时间戳拦掉，导致**上滑永远不翻面**；现在翻面与「忽略补发的 click」两条路径分开。

自测环境要求 **Node 22+**：端到端自测用 Node 内置 `WebSocket` 直连 CDP，Node 20 没有这个全局对象（CI 首次运行就是因此失败，现已把 `test.yml` 固定到 Node 22，并在脚本开头加版本守卫，版本过低时直接给出明确提示而不是 `WebSocket is not defined`）。CI 里失败时会把自测日志尾部写进 job summary 并上传截图，便于排查。

新增文件：`src/utils/sync.js`、`tests/env.mjs`、`tests/build-logic.mjs`、`tests/logic.test.mjs`、`tests/browser.test.mjs`、`.github/workflows/test.yml`
改动文件：`App.vue`、`FlashcardMode.vue`、`useTouchSwipe.js`、`wordStore.js`、`statsStore.js`、`profile.js`、`package.json`、`.gitignore`、`README.md`、`CHANGELOG.md`

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
    wordStore.js           # 单词状态 + 每日任务 + 学习调度
    statsStore.js          # 统计数据 + 个性化分析
    studentStore.js        # 学生档案（切换 / 汇总）
  pages/
    HomePage.vue           # 首页仪表盘
    StudentsPage.vue       # 学生档案（新建 / 改名 / 删除 / 切换）
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
    useTouchSwipe.js       # 触摸手势（翻卡左右 / 上下滑动）
  utils/
    profile.js             # 学生档案 + 按学生隔离的本地存储（wr_<学生id>_*）
    sync.js                # 跨标签页：存储键判定 + storage 事件监听
    supabase.js            # Supabase 客户端
    storage.js             # localStorage 封装 + 艾宾浩斯间隔常量
    word.js                # 单词数据工具
    dictionary.js          # 内置词典（300 词）
  styles/
    variables.css          # 设计系统变量
tests/
  logic.test.mjs           # 逻辑自测（Node + 内存 localStorage，131 条断言）
  build-logic.mjs          # 把逻辑自测打包成单文件（Vite 处理 src/ 的 import）
  browser.test.mjs         # 端到端自测（无头 Chrome/Edge + CDP，90 条断言）
  env.mjs                  # 逻辑自测的浏览器环境替身
.github/workflows/
  deploy.yml               # push main 后构建并发布 gh-pages
  test.yml                 # 逻辑 + 端到端自测
```
