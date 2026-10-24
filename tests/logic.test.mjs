import './env.mjs'

import { createPinia, setActivePinia } from 'pinia'
import * as profile from '../src/utils/profile.js'
import { useWordStore } from '../src/stores/wordStore.js'
import { useStatsStore } from '../src/stores/statsStore.js'
import { useBookStore } from '../src/stores/bookStore.js'
import { useStudentStore } from '../src/stores/studentStore.js'
import { pickDistractors, coreMean, parsePos } from '../src/utils/distractors.js'
import {
  MAIN_ENCOURAGEMENT, EXTRA_ENCOURAGEMENTS, pickExtra, encouragementLine
} from '../src/utils/encouragement.js'

let pass = 0
const fails = []
function ok(cond, name, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fails.push(name + (extra ? ` — ${extra}` : '')); console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`) }
}
function eq(actual, expected, name) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), name, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
}
function section(t) { console.log(`\n== ${t} ==`) }

const DAY = 86400000
const today = () => profile.todayStr()
const yesterday = () => profile.todayStr(new Date(Date.now() - DAY))

function reset() {
  localStorage.clear()
  setActivePinia(createPinia())
}

async function boot() {
  const bookStore = useBookStore()
  await bookStore.loadBooks()
  const wordStore = useWordStore()
  await wordStore.loadWords(bookStore.currentBookId)
  return { bookStore, wordStore }
}

// ---------------------------------------------------------------- 1. 学生档案
section('1. 学生档案基础操作')
reset()
{
  const s1 = profile.ensureDefaultStudent()
  eq(profile.listStudents().length, 1, '首次运行自动创建 1 名学生')
  eq(s1.name, '默认学生', '默认学生姓名正确')
  eq(profile.currentStudentId(), s1.id, '默认学生被设为当前学生')

  let dupErr = ''
  try { profile.addStudent('默认学生') } catch (e) { dupErr = e.message }
  ok(dupErr.includes('同名'), '重名学生被拒绝', dupErr)

  const s2 = profile.addStudent('张小明')
  eq(profile.listStudents().length, 2, '新建学生成功')
  profile.renameStudent(s2.id, '张小明2')
  eq(profile.findStudent(s2.id).name, '张小明2', '改名生效')

  let emptyErr = ''
  try { profile.renameStudent(s2.id, '   ') } catch (e) { emptyErr = e.message }
  ok(emptyErr.includes('不能为空'), '空名字被拒绝', emptyErr)

  // 至少保留一名学生
  profile.removeStudent(s1.id)
  let lastErr = ''
  try { profile.removeStudent(s2.id) } catch (e) { lastErr = e.message }
  ok(lastErr.includes('至少'), '最后一名学生不可删除', lastErr)
  eq(profile.listStudents().length, 1, '删除后只剩 1 名学生')
}

// ------------------------------------------------------------ 2. 旧数据迁移
section('2. 旧版全局数据迁移（首次运行）')
reset()
{
  const legacyProgress = { w1: { learnLevel: 3, nextReview: 123 } }
  const legacyWrong = ['w1', 'w2']
  const legacyRecords = { '2026-10-01': 10, '2026-10-02': 5 }
  localStorage.setItem('word_personal_progress', JSON.stringify(legacyProgress))
  localStorage.setItem('wrong_words', JSON.stringify(legacyWrong))
  localStorage.setItem('learn_record', JSON.stringify(legacyRecords))

  const stu = profile.ensureDefaultStudent()
  eq(profile.readStudentData(stu.id, 'progress'), legacyProgress, '旧进度迁入默认学生')
  eq(profile.readStudentData(stu.id, 'wrong'), legacyWrong, '旧错题迁入默认学生')
  eq(profile.readStudentData(stu.id, 'records'), legacyRecords, '旧学习记录迁入默认学生')
  eq(profile.readStudentData(stu.id, 'wrong_counts').w1, { count: 1, lastAt: profile.readStudentData(stu.id, 'wrong_counts').w1.lastAt }, '错误次数按 1 次补齐')
  ok(localStorage.getItem('word_personal_progress') !== null, '旧键保留未删除（可回滚）')

  // 已有学生后再 ensure，不应重复迁移/覆盖
  profile.saveProgress('w9', { learnLevel: 5 })
  profile.ensureDefaultStudent()
  eq(profile.getProgress().w9.learnLevel, 5, '已有学生时重复 ensure 不覆盖数据')
  eq(profile.listStudents().length, 1, '不会重复创建学生')
}

// -------------------------------------------------------------- 3. 学生隔离
section('3. 学生之间数据互不干扰')
reset()
{
  const a = profile.ensureDefaultStudent()
  const b = profile.addStudent('李四')

  profile.saveProgress('wordA', { learnLevel: 2 })
  profile.addWrong('wordA')
  profile.trackStudy('wordA')
  const aProgress = JSON.stringify(profile.getProgress())

  profile.setCurrentStudent(b.id)
  eq(profile.getProgress(), {}, '切到新学生后进度为空')
  eq(profile.getWrongIds(), [], '切到新学生后错题本为空')
  eq(profile.getTodayStudiedIds(), [], '切到新学生后今日学习为空')
  eq(profile.getSettings().dailySize, 33, '新学生默认每日任务 33 词')

  profile.saveProgress('wordB', { learnLevel: 1 })
  profile.trackStudy('wordB')

  profile.setCurrentStudent(a.id)
  eq(JSON.stringify(profile.getProgress()), aProgress, '切回学生 A 进度原样保留')
  eq(profile.getWrongIds(), ['wordA'], '学生 A 错题本不受影响')
  eq(profile.getTodayStudiedIds(), ['wordA'], '学生 A 今日学习不受影响')

  // 删除学生 B 清空其前缀键，不影响 A
  profile.removeStudent(b.id)
  const leaked = Object.keys(Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => [localStorage.key(i), 1])))
    .filter(k => k.startsWith(`wr_${b.id}_`))
  eq(leaked, [], '删除学生后其命名空间键全部清理')
  profile.setCurrentStudent(a.id)
  eq(profile.getProgress().wordA.learnLevel, 2, '删除他人后自己的数据仍在')

  // 本段落还没载入词本，汇总只应有错题/今日数据（词数段落 10 再验）
  const s = useStudentStore()
  const sumA = s.summarize(a.id)
  eq(sumA.wrong, 1, '学生档案汇总读到学生 A 的错题数')
  eq(sumA.today, 1, '学生档案汇总读到学生 A 今日学习数')
  eq(s.summarize(b.id).wrong, 0, '已删除的学生汇总为空')
}

// ---------------------------------------------------------- 4. 每日任务生成
section('4. 每日任务')
reset()
{
  const { bookStore, wordStore } = await boot()
  const bookId = bookStore.currentBookId
  eq(wordStore.rawWords.length > 300, true, `内置词库已载入（${wordStore.rawWords.length} 词）`)

  const t1 = wordStore.ensureDailyTask(bookId)
  eq(t1.ids.length, 33, '默认每日任务 33 词')
  eq(t1.date, today(), '任务日期为今天')
  eq(wordStore.taskSize, 33, 'taskSize = 33')

  const t2 = wordStore.ensureDailyTask(bookId)
  eq(t2.ids, t1.ids, '同一天重复调用返回同一批词（不重新生成）')

  const s = useStudentStore()
  eq(s.summarize(profile.currentStudentId()).today, 0, '档案页今日学习初始为 0')

  // 第二天：伪造旧日期任务，应重新生成
  profile.saveTask(bookId, { ...t1, date: '2000-01-01' })
  const t3 = wordStore.ensureDailyTask(bookId)
  eq(t3.date, today(), '隔天后重新生成今日任务')
  ok(t3.ids.length === 33, '新任务仍为 33 词')

  // 32 个词已学，任务仍应补到 33 个新词
  for (const w of wordStore.rawWords.slice(0, 32)) profile.saveProgress(w.id, { learnLevel: 1, nextReview: Date.now() + 30 * DAY })
  profile.saveTask(bookId, { ...t3, date: '2000-01-01' })
  const t4 = wordStore.ensureDailyTask(bookId)
  eq(t4.ids.length, 33, '已学词不会挤掉任务总量')

  // 每日任务上限/下限
  eq(wordStore.setDailySize(3), 5, '每日任务数下限 5')
  eq(wordStore.setDailySize(500), 100, '每日任务数上限 100')
  eq(wordStore.setDailySize(20), 20, '每日任务数可设 20')
  const t5 = wordStore.regenerateTask(bookId)
  eq(t5.ids.length, 20, '改数量后重新生成任务生效')
  wordStore.setDailySize(33)
}

// ---------------------------------------- 5. 每日任务 = 八成新词 + 两成回顾
section('5. 每日任务：八成新词 + 两成回顾')
reset()
{
  const { bookStore, wordStore } = await boot()
  const bookId = bookStore.currentBookId
  const words = wordStore.rawWords
  const now = Date.now()

  // 昨天学过、还没到期的 5 个词 → 回顾候选
  const recentIds = words.slice(200, 205).map(w => w.id)
  recentIds.forEach((id, i) => {
    profile.saveProgress(id, {
      learnLevel: 1,
      nextReview: now + 3 * DAY,
      lastLevelDate: yesterday(),
      lastSeenAt: now - DAY + i * 60000
    })
  })
  // 3 个早该复习的词，故意乱序写入到期时间
  const dueIds = [words[50].id, words[10].id, words[30].id]
  profile.saveProgress(words[50].id, { learnLevel: 2, nextReview: now - 1000, lastSeenAt: now - 2 * DAY })
  profile.saveProgress(words[10].id, { learnLevel: 3, nextReview: now - 5000, lastSeenAt: now - 2 * DAY })
  profile.saveProgress(words[30].id, { learnLevel: 1, nextReview: now - 3000, lastSeenAt: now - 2 * DAY })

  const task = wordStore.regenerateTask(bookId)
  eq(task.ids.length, 33, '每日任务仍是 33 词')
  ok(Array.isArray(task.reviewIds), '任务记录了回顾词清单')
  eq(task.reviewIds.length, 7, '回顾词约占两成（33 × 0.2 ≈ 7）')
  ok(task.reviewIds.every(id => task.ids.includes(id)), '回顾词都排在今日任务里')
  ok(dueIds.every(id => task.reviewIds.includes(id)), '早该复习的词优先进回顾名额')
  const freshCount = task.ids.filter(id => !(profile.getProgress()[id] || {}).learnLevel).length
  eq(freshCount, 26, '八成名额留给没学过的生词')
  const firstReviewAt = task.ids.findIndex(id => task.reviewIds.includes(id))
  ok(firstReviewAt > 0, '回顾词穿插在新词中间，不堆在开头', `首次出现在第 ${firstReviewAt + 1} 个`)

  // 很久没学、离到期还远的词不该占今天的名额（保证第二天是一批新词）
  const futureId = words[100].id
  profile.saveProgress(futureId, { learnLevel: 5, nextReview: now + 50 * DAY, lastSeenAt: now - 10 * DAY })
  const task2 = wordStore.regenerateTask(bookId)
  ok(!task2.ids.includes(futureId), '离到期还远的旧词不进今天的任务')
}

// --------------------------------------------------------- 6. 艾宾浩斯调度
section('6. 艾宾浩斯复习间隔')
reset()
{
  const { wordStore } = await boot()
  const id = wordStore.rawWords[1].id
  const p0 = profile.getProgress()[id] || {}

  wordStore.markRight(id)
  let p = profile.getProgress()[id]
  eq(p.learnLevel, 1, '第一次答对升到 Lv.1')
  ok(Math.abs(p.nextReview - (Date.now() + 1 * DAY)) < 5000, 'Lv.1 间隔 ≈ 1 天', `${Math.round((p.nextReview - Date.now()) / 1000)}s`)

  wordStore.markRight(id)
  p = profile.getProgress()[id]
  eq(p.learnLevel, 1, '同一天重复答对不升级（避免一遍就“掌握”）')
  ok(Math.abs(p.nextReview - (Date.now() + 1 * DAY)) < 5000, '同日重复答对仍按 1 天安排')

  // 模拟昨天答对过 → 今天再对升到 Lv.2，间隔 2 天
  profile.saveProgress(id, { lastLevelDate: yesterday() })
  wordStore.markRight(id)
  p = profile.getProgress()[id]
  eq(p.learnLevel, 2, '隔天答对升到 Lv.2')
  ok(Math.abs(p.nextReview - (Date.now() + 2 * DAY)) < 5000, 'Lv.2 间隔 ≈ 2 天')

  // 逐级推进，检查 1/2/4/7/15/30/60 天
  const expectedDays = [3, 4, 5, 6, 7]
  for (const lv of expectedDays) {
    profile.saveProgress(id, { lastLevelDate: yesterday() })
    wordStore.markRight(id)
    p = profile.getProgress()[id]
    const days = { 3: 4, 4: 7, 5: 15, 6: 30, 7: 60 }[lv]
    eq(p.learnLevel, lv, `升到 Lv.${lv}`)
    ok(Math.abs(p.nextReview - (Date.now() + days * DAY)) < 5000, `Lv.${lv} 间隔 ≈ ${days} 天`)
  }

  profile.saveProgress(id, { lastLevelDate: yesterday() })
  wordStore.markRight(id)
  p = profile.getProgress()[id]
  eq(p.learnLevel, 7, '等级封顶 Lv.7')
  ok(Math.abs(p.nextReview - (Date.now() + 60 * DAY)) < 5000, '封顶后继续按 60 天滚动')
}

// -------------------------------------------------- 7. 模糊 / 不认识 / 错题本
section('7. 模糊、不认识与错题本')
reset()
{
  const { bookStore, wordStore } = await boot()
  wordStore.ensureDailyTask(bookStore.currentBookId)
  const target = wordStore.taskWords[0]
  const id = target.id

  wordStore.markHard(id)
  let p = profile.getProgress()[id]
  eq(p.learnLevel, 0, '模糊不提升等级')
  ok(Math.abs(p.nextReview - (Date.now() + 30 * 60000)) < 5000, '模糊 30 分钟后重现')
  eq(profile.getWrongIds(), [id], '模糊进错题本')
  eq(profile.getWrongCounts()[id].count, 1, '错误次数 +1')

  wordStore.markWrong(id)
  p = profile.getProgress()[id]
  eq(p.learnLevel, 0, '不认识等级归零')
  ok(Math.abs(p.nextReview - (Date.now() + 5 * 60000)) < 5000, '不认识 5 分钟后重现')
  eq(profile.getWrongCounts()[id].count, 2, '错误次数累加为 2')

  wordStore.markRight(id)
  eq(profile.getWrongIds(), [], '答对后移出错题本')
  eq(profile.getWrongCounts()[id].count, 2, '移出错题本后错误次数保留')

  const wrongItem = wordStore.wrongWordList.find(w => w.id === id)
  eq(wrongItem, undefined, '错题列表不再含该词')

  wordStore.markWrong(id)
  const item2 = wordStore.wrongWordList.find(w => w.id === id)
  eq(item2.wrongCount, 3, '错题本显示累计错误次数')
  ok(item2.lastWrongAt > 0, '错题本显示最近错误时间')
}

// ---------------------------------------------------- 8. 三模式同一批词 & 顺序
section('8. 三种模式取词一致')
reset()
{
  const { bookStore, wordStore } = await boot()
  const bookId = bookStore.currentBookId
  wordStore.setShuffle(false)
  const task = wordStore.regenerateTask(bookId)
  const order = wordStore.taskWords.map(w => w.id)
  eq(order, task.ids, '不乱序时顺序 = 任务顺序')

  // 三个模式都是对 taskWords 做同样过滤后的结果（单词缺释义/拼写字段才剔除）
  const flash = wordStore.taskWords
  const quiz = wordStore.taskWords.filter(w => w.mean)
  const spelling = wordStore.taskWords.filter(w => w.word)
  eq(quiz.map(w => w.id), flash.map(w => w.id), '选择题取词 = 翻卡取词（默认词库都有释义）')
  eq(spelling.map(w => w.id), flash.map(w => w.id), '拼写取词 = 翻卡取词')
  eq(new Set(flash.map(w => w.mean)).size, flash.length, '任务内释义不重复（选择题不会出现同义选项）')

  wordStore.setShuffle(true)
  const a = wordStore.taskWords.map(w => w.id)
  const b = wordStore.taskWords.map(w => w.id)
  eq(a, b, '乱序在同一天内稳定（两次读取一致）')
  eq(a.slice().sort(), order.slice().sort(), '乱序不改变词的集合，只改顺序')
  ok(JSON.stringify(a) !== JSON.stringify(order), '乱序确实打乱了顺序')
  wordStore.setShuffle(false)
}

// ------------------------------------------------------- 9. 学习记录 / 连续天数
section('9. 学习记录与连续天数')
reset()
{
  profile.ensureDefaultStudent()
  eq(profile.trackStudy('w1'), 1, '首次记录返回 1')
  eq(profile.trackStudy('w1'), 1, '同一天同词只算一次')
  eq(profile.trackStudy('w2'), 2, '第二个词计数为 2')
  eq(profile.getRecords()[today()], 2, '按日期记录当天词数')

  const rec = {}
  for (let i = 0; i < 4; i++) rec[profile.todayStr(new Date(Date.now() - i * DAY))] = 5
  eq(profile.calcStreak(rec), 4, '连续 4 天')
  rec['2000-01-01'] = 3
  eq(profile.calcStreak(rec), 4, '断档不累计')
  eq(profile.calcStreak({}), 0, '无记录为 0')
  eq(profile.calcStreak({ '2000-01-01': 1 }), 0, '很久以前的学习不算当前连续')
  const onlyYesterday = {}
  onlyYesterday[profile.todayStr(new Date(Date.now() - DAY))] = 3
  eq(profile.calcStreak(onlyYesterday), 1, '昨天学过今天还没学，连续天数仍算 1')
}

// -------------------------------------------------------- 10. 分析与统计
section('10. 个性化分析 & 统计')
reset()
{
  const { bookStore, wordStore } = await boot()
  const bookId = bookStore.currentBookId
  const stats = useStatsStore()
  const name = profile.currentStudent()?.name || '未选择学生'
  await stats.loadStats(bookId)
  ok(stats.analysisReport.join('').includes(name), '分析中包含当前学生姓名', name)
  eq(stats.totalWords, wordStore.rawWords.length, '统计总词数 = 词本词数')

  // 学 10 词 → 掌握 10、掌握率 10/总
  for (const w of wordStore.rawWords.slice(0, 10)) wordStore.markRight(w.id)
  await stats.loadStats(bookId)
  eq(stats.learnedWords, 10, '已掌握 = 10')
  eq(stats.masteryRate, Math.round((10 / stats.totalWords) * 100), '掌握率计算正确')
  eq(stats.levelDistribution[1], 10, '等级分布 Lv.1 = 10')
  ok(stats.analysisReport.join('').includes('今天已学'), '分析包含今日学习进度')

  // 错词排序
  const w1 = wordStore.rawWords[20].id
  const w2 = wordStore.rawWords[21].id
  wordStore.markWrong(w1); wordStore.markWrong(w1); wordStore.markWrong(w2)
  await stats.loadStats(bookId)
  eq(stats.topWrongWords[0].id, w1, '高频错词按次数排序')
  ok(stats.analysisReport.join('').includes('错得最多'), '分析包含最高频错词')

  // 学生列表汇总
  const s = useStudentStore()
  const sum = s.summarize(profile.currentStudentId())
  eq(sum.learned, 10, '档案汇总已掌握 = 10')
  eq(sum.total, stats.totalWords, '档案汇总总词数一致')
  eq(sum.wrong, 2, '档案汇总错题 = 2')
}

// ------------------------------------------- 11. 响应式：今日任务完成数会更新
section('11. 今日任务完成数随手学更新（UI 计数器）')
reset()
{
  const { bookStore, wordStore } = await boot()
  wordStore.ensureDailyTask(bookStore.currentBookId)
  const before = wordStore.taskDoneCount
  eq(before, 0, '初始今日任务完成 0')
  wordStore.markRight(wordStore.taskWords[0].id)
  eq(wordStore.taskDoneCount, 1, '答对一词后今日任务完成数 +1')
  wordStore.markRight(wordStore.taskWords[1].id)
  eq(wordStore.taskDoneCount, 2, '再答对一词后 +1')
}

// ------------------------------------- 12. 响应式：再次进入统计页数据要刷新
section('12. 再次进入统计页数据刷新')
reset()
{
  const { bookStore, wordStore } = await boot()
  const bookId = bookStore.currentBookId
  const stats = useStatsStore()
  wordStore.ensureDailyTask(bookId)
  await stats.loadStats(bookId)
  const t0 = stats.todayUnique
  const rate0 = stats.taskDoneRate
  wordStore.markRight(wordStore.taskWords[0].id)
  wordStore.markRight(wordStore.taskWords[1].id)
  await stats.loadStats(bookId)
  eq(stats.todayUnique, t0 + 2, '重新 loadStats 后今日学习数刷新')
  ok(stats.taskDoneRate > rate0, '今日任务完成率刷新')
  eq(stats.streakDays, 1, '连续天数刷新为 1')
}

// -------------------------------------------------------------- 13. 边界
section('13. 边界与健壮性')
reset()
{
  profile.ensureDefaultStudent()
  ok(JSON.stringify(profile.getProgress()) === '{}', '无数据时进度为空对象')
  eq(profile.getWrongIds(), [], '无数据时错题为空数组')
  eq(profile.intervalMs(1), DAY, 'intervalMs(1) = 1 天')
  eq(profile.intervalMs(7), 60 * DAY, 'intervalMs(7) = 60 天')
  eq(profile.intervalMs(99), 60 * DAY, '超范围等级按 60 天')
  eq(profile.intervalMs(0), DAY, '等级 0 按 1 天')
  eq(profile.todayStr(new Date(2026, 0, 5)), '2026-01-05', '日期补零格式正确')
  eq(profile.scopedKey('progress', 'stu_x'), 'wr_stu_x_progress', '命名空间键格式正确')

  // 损坏的 localStorage 不应抛错
  localStorage.setItem(profile.scopedKey('progress'), '{坏掉的 json')
  eq(profile.getProgress(), {}, '损坏数据回退为空对象不崩溃')

  const { wordStore } = await boot()
  eq(wordStore.taskWords.length, 0, '没有任务时 taskWords 为空数组')
}

// ------------------------------------------- 14. 跨标签页并发（模拟另一个标签页写 localStorage）
section('14. 跨标签页：以后写入者为准，不丢更新')
reset()
{
  const { bookStore, wordStore } = await boot()
  const bookId = bookStore.currentBookId
  wordStore.ensureDailyTask(bookId)
  const localIds = [...wordStore.task.ids]
  ok(localIds.length === 33, '本页先生成 33 词任务', String(localIds.length))

  // 另一个标签页同时生成了今日任务（这里用顺序颠倒表示“另一份”）
  const otherTask = { date: today(), ids: [...localIds].reverse(), size: localIds.length, bookId }
  profile.saveTask(bookId, otherTask)
  wordStore.syncFromStorage()
  eq(wordStore.task.ids, otherTask.ids, '别的标签页写入今日任务后，本页收敛到存储里的那份')
  eq(wordStore.taskWords.map(w => w.id), otherTask.ids, 'taskWords 跟随收敛后的任务顺序')

  const cached = wordStore.ensureDailyTask(bookId)
  eq(cached.ids, otherTask.ids, '当日任务已存在时 ensureDailyTask 不再覆盖别的标签页写入')

  // 进度：别的标签页先答对一个词，本页再答对另一个词，两边都要在
  const [a, b, c] = otherTask.ids
  profile.saveProgress(a, { learnLevel: 2, nextReview: Date.now() + DAY })
  profile.trackStudy(a) // 另一个标签页的 markRight 会同时写进度和今日已学
  wordStore.markRight(b)
  const progress = profile.getProgress()
  eq(progress[a]?.learnLevel, 2, '别的标签页写的进度不被本页覆盖')
  ok(!!progress[b], '本页新答对的词也写入了进度')
  ok(!!progress[a] && !!progress[b], '两次写入并存，没有丢更新')

  // 今日已学：别的标签页学过 a，本页同步后应看到；再学 c 时不能丢掉 a
  wordStore.syncFromStorage()
  ok(wordStore.studiedIds.includes(a), '同步后能看到别的标签页今天学过的词')
  eq(wordStore.taskDoneCount, 2, '今日任务完成数按并集统计（a + b）')
  wordStore.markRight(c)
  const studied = profile.getTodayStudiedIds()
  ok([a, b, c].every(id => studied.includes(id)), '本页再学一词不会冲掉别的标签页的记录')
  eq(wordStore.taskDoneCount, 3, '完成数更新为 3')

  // 设置：别的标签页改了每日词数与乱序，本页同步跟随
  profile.saveSettings({ dailySize: 20, shuffle: true })
  wordStore.syncFromStorage()
  eq(wordStore.dailySize, 20, '同步后每日词数跟随别的标签页')
  eq(wordStore.shuffleMode, true, '同步后乱序开关跟随别的标签页')

  // 别的标签页留下的过期任务（不是今天）不应被当成今日任务
  profile.saveTask(bookId, { date: yesterday(), ids: [a], size: 1, bookId })
  wordStore.syncFromStorage()
  eq(wordStore.task, null, '同步到过期任务时清空内存里的今日任务')
}

// -------------------------------------------- 15. 干扰项难度、语境例句与鼓励语
section('15. 干扰项、语境例句与鼓励语')
reset()
{
  const { wordStore } = await boot()
  const pool = wordStore.wordList
  ok(pool.length > 300, `整个词库可供出题（${pool.length} 词）`)

  // 取一个释义较长的词做正确答案，抽 12 次，每次都要凑齐 3 个合格干扰项
  const correct = pool.find(w => w.mean && coreMean(w.mean).length >= 4) || pool[0]
  const correctPos = parsePos(correct.mean)
  let rounds = 0
  let posRounds = 0
  for (let i = 0; i < 12; i++) {
    const opts = pickDistractors(correct, pool, { count: 3 })
    if (opts.length !== 3) continue
    const all = [correct, ...opts]
    const cores = all.map(o => coreMean(o.mean))
    const wordsUniq = new Set(all.map(o => String(o.word).toLowerCase()))
    const meansUniq = new Set(cores)
    const overlap = cores.some(a => cores.some(b => a !== b && (a.includes(b) || b.includes(a))))
    if (wordsUniq.size === 4 && meansUniq.size === 4 && !overlap) rounds++
    if (correctPos.length && opts.some(o => parsePos(o.mean).some(p => correctPos.includes(p)))) posRounds++
  }
  eq(rounds, 12, '12 次抽题：4 个选项词不同、释义不同且互不包含')
  if (correctPos.length) {
    eq(posRounds, 12, `干扰项优先同词性（正确词词性 ${correctPos.join('/')}）`)
  }

  const opts = pickDistractors(correct, pool, { count: 3 })
  ok(opts.every(o => o.id !== correct.id), '干扰项不等于正确答案')
  ok(opts.every(o => o.sentence), '干扰项本身也带例句（可安全展示）')
  eq(pickDistractors(correct, pool, { count: 3, recent: opts.map(o => coreMean(o.mean)) }).length, 3,
    '带上「最近出现过」清单也照样凑齐 3 个')

  // 例句：688 词全部要有，且各不相同
  const noSentence = wordStore.rawWords.filter(w => !w.sentence || w.sentence.trim().length < 8)
  eq(noSentence.length, 0, `每个单词都有语境例句（共 ${wordStore.rawWords.length} 词）`)
  eq(new Set(wordStore.rawWords.map(w => w.sentence)).size, wordStore.rawWords.length, '例句各不相同，没有套模板')

  // 鼓励语
  ok(MAIN_ENCOURAGEMENT.includes('完成一天任务'), '主鼓励语是「完成一天任务」那句', MAIN_ENCOURAGEMENT)
  ok(EXTRA_ENCOURAGEMENTS.includes('棒棒哒！') && EXTRA_ENCOURAGEMENTS.includes('好棒！'), '附加语含「棒棒哒！」「好棒！」')
  ok(EXTRA_ENCOURAGEMENTS.includes(pickExtra('2026-01-01')), '附加语取自预设列表')
  eq(pickExtra('2026-01-01'), pickExtra('2026-01-01'), '同一天挑到的附加语固定不变')
  ok(encouragementLine('2026-01-01').includes(MAIN_ENCOURAGEMENT), '整句鼓励语包含主句')
}

console.log(`\n===== 逻辑自测结果：${pass} 通过，${fails.length} 失败 =====`)
if (fails.length) {
  fails.forEach((f, i) => console.log(`  失败 ${i + 1}. ${f}`))
  process.exitCode = 1
}
