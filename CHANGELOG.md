# 📖 单词复习系统 — 变更日志

> 基于 Vue 3 + Element Plus + Supabase 的艾宾浩斯记忆曲线单词复习工具

---

## 功能总览

| 功能 | 说明 |
|------|------|
| ✅ 五种学习模式 | 翻卡背诵（正面只放英文音标，点一下＝发音＋翻面）、选择题（先选中再确认）、拼写（手写板 / 键盘）、**完形填空**、**音节背记**，抽查内容与顺序完全一致 |
| ✅ 艾宾浩斯复习 | 答对升一级，间隔 1→2→4→7→15→30→60 天滚动（模糊 30 分钟、不认识 5 分钟） |
| ✅ 三档评价 | 不认识 / 模糊 / 认识，精细控制记忆曲线 |
| ✅ 学生档案 | 每个学生一份独立记录（进度 / 错题 / 记录 / 任务），切换即换档案 |
| ✅ 每日任务 | 默认 **40 词**，**5～200 可调**，**八成新词 + 两成近期回顾**，均匀穿插，五模式共用同一批词；同批任务不放释义相同的词 |
| ✅ 中考词表 | 新装自动种入「中考必背2000英语词汇」**2009 词**（2025 秋新课标中考词表，零依赖 docx 解析） |
| ✅ 乱序抽查 | 当天固定乱序，五模式顺序一致，便于互相抽查（开关核心 54×26、整行 ≥44px，好按） |
| ✅ 今日单词表 | 每天这批词单独一页做成表格：英文 / 音标 / 音节 / 词性·释义 / 例句 / 发音，翻卡里不再放中文 |
| ✅ 100 词测试卷 | 随机 100 词打乱顺序，一题 1 分，100=Excellent、≥95 Good、≥90 Normal、<90 Come on，交卷列错词 |
| ✅ 语境例句 | 688 词每词一句例句，中考词表能借到例句的词也补上，翻卡 / 选择 / 完形 / 单词表都能看到用法 |
| ✅ 按音节背记 | `syllable.js` 按音标切音节（`ə·ˈkɒm·plɪʃ`），标重音、可逐音节听，长单词先记骨架再填字母 |
| ✅ 音效与烟花 | Web Audio 现场合成的对/错/连对/完成音效，任务完成与交卷飘烟花，「拼读音效」开关可一键静音 |
| ✅ 连对激励 | 连对 3/4/5/6/7/8/9+ 给 Good/Great/Brilliant/Wonderful/Fantastic/Excellent/Perfect，音效升调 + 小闪光 |
| ✅ 完成鼓励 | 当天任务做完，各模式与首页弹出「恭喜你，完成一天任务，继续坚持！」+ 随机附加句 + 烟花 |
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

### Phase 6：学生档案 + 每日任务

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

### Phase 7：并发与触屏收尾

| 问题 | 修复 |
|------|------|
| 同一学生开两个标签页时，今日任务可能互相覆盖 | `ensureDailyTask` 写完立即回读，内存里始终是存储里的那一份；新增 `src/utils/sync.js` 监听 `storage` 事件，`App.vue` 收到别的标签页写入后调 `wordStore.syncFromStorage()`（进度 + 今日任务 + 每日任务量/乱序）与 `statsStore` 重算，今日任务**以后写入者为准**；学生档案键变化则整页重载，避免读到上一名学生的数据；正在背的这一轮队列不被打断 |
| 触屏滑动只是"文档里说有"，实际没有生效 | `useTouchSwipe` 重写为 `touchstart/touchmove/touchend` 三段判定（阈值 50px，方向需占优 1.2 倍，手势超过 1s 不计），绑到 `.flashcard-wrapper`；**答案未显示时四个方向都只翻面**，答案显示后右滑=认识、左滑=不认识、下滑=模糊、上滑不评分；`touchend` 后浏览器补发的 `click` 用 `justSwiped()` 吞掉，不会切到下一张就自动翻面 |
| 自测脚本在仓库外的临时目录，长期容易丢失 | 自测搬进 `tests/`：`logic.test.mjs`（逻辑，Node + 内存 localStorage）、`browser.test.mjs`（端到端，无头浏览器 + CDP 真点真滑，自带静态服务器）、`env.mjs` / `build-logic.mjs`（环境替身与打包）；新增 `npm run test:logic / test:e2e / test`；新增 `.github/workflows/test.yml`，push 与 PR 都跑 |

自测覆盖：逻辑自测 131 条断言（含「跨标签页：以后写入者为准，不丢更新」14 条），端到端自测 90 条断言（含双标签页同步 13 条、移动端触屏滑动 15 条 + 控制台无 error）。

修复的隐藏 bug：`useTouchSwipe` 在 `touchend` 里先把「刚滑动过」时间戳写好再触发回调，而 `onSwipeUp` 走的 `handleShowAnswer` 一进来就被这个时间戳拦掉，导致**上滑永远不翻面**；现在翻面与「忽略补发的 click」两条路径分开。

自测环境要求 **Node 22+**：端到端自测用 Node 内置 `WebSocket` 直连 CDP，Node 20 没有这个全局对象（CI 首次运行就是因此失败，现已把 `test.yml` 固定到 Node 22，并在脚本开头加版本守卫，版本过低时直接给出明确提示而不是 `WebSocket is not defined`）。CI 里失败时会把自测日志尾部写进 job summary 并上传截图，便于排查。

CI 排障另外暴露两处真问题：① `vite.config.js` 在 CI 上把 `base` 设成 `/word-review/`，而自测自带静态服务器挂在根路径，线上那份构建跑自测就会白屏——服务器现在从 `dist/index.html` 自动识别 base 前缀并挂在同一路径下；② 错题本与统计页的「最近错误」用不带 locale 的 `toLocaleDateString()`，在 en 环境浏览器里显示成 `10/18/2026`，现固定按 `zh-CN` 显示。

新增文件：`src/utils/sync.js`、`tests/env.mjs`、`tests/build-logic.mjs`、`tests/logic.test.mjs`、`tests/browser.test.mjs`、`.github/workflows/test.yml`
改动文件：`App.vue`、`FlashcardMode.vue`、`useTouchSwipe.js`、`wordStore.js`、`statsStore.js`、`profile.js`、`package.json`、`.gitignore`、`README.md`、`CHANGELOG.md`

### Phase 8：背记体验与题目质量（本轮）

| 反馈 | 修复 |
|------|------|
| 乱序抽查那个滑动按钮不灵敏 | 开关放大到核心 54×26（`__action` 20px）、整行最小高度 44px；打开 `inline-prompt` 常显「已开/已关」；切换时把重挂载推迟到 `nextTick`，不再出现"点一下像被弹回去" |
| 背记部分要中英文都显示 | 翻卡**正面**同时显示英文、音标、中文释义，翻面后追加语境例句；不用先翻面才能看意思 |
| 688 个单词希望能整体显现、按天背记 | 背诵页新增「今日单词一览」：当天这批词（默认 33 词）整体摊开，英文 + 音标 + 释义 + 例句 + 发音按钮，回顾词带「回顾」标签，默认收起 |
| 选择题点一下就选中、错了不能撤销 | 改成「先选中 → 点确认才判对错」：再点同一项可取消（确认按钮随之置灰），没确认前不算答错、不计入错题本 |
| 选项重复、太容易靠排除法猜 | 新增 `src/utils/distractors.js`：干扰项优先同词性、释义长度接近、与正确答案互不包含，并对近期出现过的词降权；12 次抽题四选项全不相同、互不包含 |
| 第二天背的词和前一天大量重复 | 每日任务改为 **80% 新词 + 20% 近期回顾**（默认 33 词 ≈ 26 新 + 7 回顾，回顾取自近 3 天），新词与回顾词均匀穿插；`markRight / markHard / markWrong` 都写 `lastSeenAt` 作为回顾候选依据 |
| 完成一天任务需要鼓励 | 三种模式与首页在当天任务做完时展示固定主句「恭喜你，完成一天任务，继续坚持！」，再按日期挑一条附加句（含「棒棒哒！」「好棒！」），同一天固定不变；新增 `src/utils/encouragement.js` |
| 一个单词要在具体语境里 | 688 词全部补上语境例句（`defaultWords.json` 的 `sentence`），翻卡翻面、选择题反馈、拼写反馈、今日单词一览都会显示；种子版本升到 2，老数据首次运行按单词补例句，**不覆盖用户自己写的句子** |
| 有错但错题本里没体现 | `WrongBookPage` 进页面先加载词库（原来词库为空时错词 id 匹配不到单词，表格渲染成空） |

自测覆盖：逻辑自测 **149** 条断言（新增第 5 节「每日任务：八成新词 + 两成回顾」8 条、第 15 节「干扰项、语境例句与鼓励语」13 条），端到端自测 **124** 条断言（新增「乱序抽查开关可点、今日单词整体一览」13 条、「老版本种子词升级时补例句」4 条、「完成后弹鼓励语」8 条）。

已知边界：乱序开关的放大是在 CSS 层保证热区尺寸（自测断言了真实渲染尺寸 ≥54×26、整行 ≥44），真机手指手感仍需上手确认。

新增文件：`src/utils/distractors.js`、`src/utils/encouragement.js`
改动文件：`FlashcardMode / QuizMode / SpellingMode`、`StudyPage / HomePage / WrongBookPage`、`wordStore.js`、`localStore.js`、`defaultWords.json`、`tests/logic.test.mjs`、`tests/browser.test.mjs`、`README.md`、`CHANGELOG.md`

### Phase 9：中考词表 + 五种模式 + 音效烟花（本轮）

| 反馈 | 做法 |
|------|------|
| 答错的表情太随便 | 答错的 😅 换成**思考表情 🤔**，配文「再想想，正确答案是：」+ 正确释义 |
| 一天任务完成想有点仪式感 | 新增 `Fireworks.vue`（纯 CSS/DOM 烟花，无依赖），翻卡 / 选择 / 拼写 / 完形完成当天任务、测试卷交卷都飘烟花，同时播完成音效 |
| 「看中文写英文」改成手写 | 新增 `HandwritingPad.vue`（canvas 手写板，按住写、一键清空），拼写模式默认手写：写完点「对答案」看标准答案再自评对/错；右上角可「⌨️ 改用键盘 / ✍️ 改用手写」。**不做 OCR**，手写靠自评，键盘模式仍是自动判对错 |
| 翻卡要边看边听发音，别单独点喇叭 | 点卡片一下＝`triggerSpeak()` + 翻面；喇叭按钮保留给只想听发音的场景 |
| 选择题抽查太简单 | `distractors.js` 重写：先按 `parsePos` 解析词性，**严格同词性优先**；再按释义共用汉字（`coreMean`）、拼写形近（编辑距离）、音标音近打分排序；跳过与正确答案释义互相包含的词；近期出现过的词降权。词性凑不齐才降级回全库 |
| 想教学生怎么背单词 | 新增 `syllable.js` + `SyllableMode.vue`：按音标切音节（元音核 → 最大音节首，`pl- / str- / tʃ` 不拆），标出重音音节，可逐音节听，长单词先记骨架 |
| 要有 100 词的卷子验收 | 新增 `exam.js` + `ExamPage.vue`（路由 `/exam`）：随机 100 词打乱、看英文选中文、一题 1 分、可翻页改答案；评级 100=Excellent / ≥95 Good / ≥90 Normal / <90 Come on，成绩页列错词并写入进度（对的升级、错的进错题本） |
| 把桌面那份中考词表导入 | 新增 `scripts/parse-docx-vocab.mjs`（零依赖 zip + XML 解析），生成 `src/utils/middleSchoolWords.json`：**2009** 条（docx 实际条数，非 2000），字段 `word / phonetic / mean / sentence`；`localStore` 种入词本「中考必背2000英语词汇」，独立版本键只种一次，不会把用户删掉的词塞回来 |
| 一天背多少要能自己设 | 每日任务默认 **40 词**（原 33），`setDailySize` 夹 **5～200**，「每日任务量」输入框当天立即生效；8:2 配比随之变成 40 ≈ 32 新 + 8 回顾 |
| 同一批任务出现 a / an 这种同义词 | `ensureDailyTask` 加**同义去重**：一批任务里不放 `coreMean` 相同的词，凑不够才按原规则放宽兜底 |
| 要类似完形填空 | 新增 `cloze.js` + `ClozeMode.vue`：出题池顺序为今天这批词 → 近 3 天见过的词 → 全库兜底，点选项即判，最多 12 题；`maskSentence` 支持 `study → studied / studies` 这类变形，句子里没有目标词就不硬挖 |
| 选择题要有对错音效 | 新增 `useSound.js`：Web Audio 现场合成，不引入任何版权音频；答对上行双音、答错低沉短音、完成一串琶音，「拼读音效」开关可全局静音 |
| 连对要有激励，音效不同 + 小闪光 | 新增 `streak.js` + `StreakFlash.vue`：连对 3/4/5/6/7/8/9+ → Good / Great / Brilliant / Wonderful / Fantastic / Excellent / Perfect，档位越高音高越高，页头常显 `🔥 N 连对`，达标弹闪光 |
| 翻卡里不要中文 | 翻卡正反面都不再出现中文释义，背面改为显示**音节串 + 语境例句**；中文统一收到新页面「今日单词表」（`/daily-words`，`el-table`：序号 / 单词 / 音标 / 音节 / 词性·释义 / 例句 / 🔊） |
| 拼写部分不要音标 | 拼写模式去掉音标提示，只给中文释义 |

自测覆盖：逻辑自测 **206** 条断言（新增第 16 节音节 12 条、第 17 节连对与评级 20 条、第 18 节测试卷抽词 7 条、第 19 节词表完整性与种入幂等 10 条），端到端自测 **327** 条断言（今日单词表整表可读、五种模式都能出题、连对 3 题给 Good 闪光、100 词测试卷全对得 Excellent、翻卡无中文但有点击发音与音节串；第 15 节按 12 项需求逐条断言：🤔 思考表情、完成放烟花、手写拼写、点卡即发音、干扰项同词性、音节背记、任务量可调、100 词测试卷评级、完形、音效开关、连对 7 档称号）。

已知边界：① 词表来自 docx，源文件只有 2009 条（文件名写 2000 是取整），另有几十条释义因原文两栏排版被串在一起，属源头数据问题；② 手写不自带识别，判对错靠学生自评；③ 中考词表里约 566 个词能借到例句，完形只能在这些词里出，其余词在其他模式下正常用；④ 音效是 Web Audio 合成的近似音色，不是开心消消乐的原始素材（避免版权）。

新增文件：`src/utils/middleSchoolWords.json`、`src/utils/syllable.js`、`src/utils/streak.js`、`src/utils/exam.js`、`src/utils/cloze.js`、`src/utils/sentences.js`、`src/composables/useSound.js`、`src/components/Fireworks.vue`、`src/components/HandwritingPad.vue`、`src/components/StreakFlash.vue`、`src/components/ClozeMode.vue`、`src/components/SyllableMode.vue`、`src/pages/DailyWordsPage.vue`、`src/pages/ExamPage.vue`、`scripts/parse-docx-vocab.mjs`
改动文件：`FlashcardMode / QuizMode / SpellingMode / AppSidebar`、`StudyPage`、`router/index.js`、`wordStore.js`、`bookStore.js`、`localStore.js`、`profile.js`、`distractors.js`、`useSpeech.js`、`tests/logic.test.mjs`、`tests/browser.test.mjs`、`README.md`、`CHANGELOG.md`

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
| Web Audio API | 对 / 错 / 连对 / 完成音效（现场合成，无音频文件） |
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
    StudyPage.vue          # 背诵页面（五种模式 + 任务量 / 乱序 / 音效开关）
    DailyWordsPage.vue     # 今日单词表（表格 + 中文释义）
    ExamPage.vue           # 100 词测试卷（评级 + 错词表）
    WrongBookPage.vue      # 错题本
    StatsPage.vue          # 学习统计 + 图表
  components/
    AppSidebar.vue         # 侧栏导航
    FlashcardMode.vue      # 翻卡模式（点一下＝发音＋翻面）
    QuizMode.vue           # 选择题模式（连对激励 + 音效）
    SpellingMode.vue       # 拼写模式（手写 / 键盘）
    ClozeMode.vue          # 完形填空
    SyllableMode.vue       # 音节背记
    HandwritingPad.vue     # 手写板（canvas）
    Fireworks.vue          # 完成任务 / 交卷烟花
    StreakFlash.vue        # 连对闪光
    ImportDialog.vue       # 批量导入弹窗
  composables/
    useChart.js            # Chart.js 生命周期
    useSpeech.js           # TTS 封装
    useSound.js            # Web Audio 音效（对 / 错 / 连对 / 完成）
    useTouchSwipe.js       # 触摸手势（翻卡左右 / 上下滑动）
  utils/
    profile.js             # 学生档案 + 按学生隔离的本地存储（wr_<学生id>_*）
    sync.js                # 跨标签页：存储键判定 + storage 事件监听
    supabase.js            # Supabase 客户端
    storage.js             # localStorage 封装 + 艾宾浩斯间隔常量
    localStore.js          # 未配置 Supabase 时的本地词本存储 + 种子词版本升级
    distractors.js         # 干扰项：严格同词性 + 易混淆打分
    encouragement.js       # 完成任务鼓励语（主句 + 按日期挑附加句）
    syllable.js            # 按音标切音节 + 重音位置
    streak.js              # 连对标号档位（3 Good … 9 Perfect）
    exam.js                # 测试卷抽词与评级
    cloze.js               # 完形挖空（含词形变化）
    sentences.js           # 例句库（给没有例句的词借一句）
    word.js                # 单词数据工具
    dictionary.js          # 内置词典（300 词）
    defaultWords.json      # 默认词库（688 词，含音标 / 释义 / 语境例句）
    middleSchoolWords.json # 中考必背2000英语词汇（2009 词，docx 解析生成）
  styles/
    variables.css          # 设计系统变量
scripts/
  parse-docx-vocab.mjs     # 零依赖解析 docx 词表 → middleSchoolWords.json
tests/
  logic.test.mjs           # 逻辑自测（Node + 内存 localStorage，206 条断言）
  build-logic.mjs          # 把逻辑自测打包成单文件（Vite 处理 src/ 的 import）
  browser.test.mjs         # 端到端自测（无头 Chrome/Edge + CDP，327 条断言）
  env.mjs                  # 逻辑自测的浏览器环境替身
.github/workflows/
  deploy.yml               # push main 后构建并发布 gh-pages
  test.yml                 # 逻辑 + 端到端自测
```
