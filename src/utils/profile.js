// 学生档案：每个学生一份独立的本地记录，互不干扰
// 命名空间：wr_<学生id>_<数据名>
import { EBBINGHAUS } from './storage'

const STUDENTS_KEY = 'word_review_students'
const CURRENT_KEY = 'word_review_current_student'
const DEFAULT_STUDENT_NAME = '默认学生'

/** 旧版本全局数据，首次运行并入“默认学生” */
const LEGACY_KEYS = {
  progress: 'word_personal_progress',
  wrong: 'wrong_words',
  records: 'learn_record'
}

const DEFAULT_SETTINGS = { dailySize: 33, shuffle: false }

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function todayStr(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function makeStudentId() {
  return `stu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ---------- 学生列表 ----------

export function listStudents() {
  return read(STUDENTS_KEY, [])
}

export function findStudent(id) {
  return listStudents().find(s => s.id === id) || null
}

export function addStudent(name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('学生姓名不能为空')
  const list = listStudents()
  if (list.some(s => s.name === trimmed)) throw new Error('已有同名学生，请换一个名字')
  const student = { id: makeStudentId(), name: trimmed, created_at: new Date().toISOString() }
  list.push(student)
  write(STUDENTS_KEY, list)
  return student
}

export function renameStudent(id, name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('学生姓名不能为空')
  const list = listStudents()
  if (list.some(s => s.id !== id && s.name === trimmed)) throw new Error('已有同名学生，请换一个名字')
  const target = list.find(s => s.id === id)
  if (!target) throw new Error('学生不存在')
  target.name = trimmed
  write(STUDENTS_KEY, list)
  return target
}

/** 删除学生及其全部记录，至少保留一名学生 */
export function removeStudent(id) {
  const list = listStudents()
  if (list.length <= 1) throw new Error('至少需要保留一名学生')
  const next = list.filter(s => s.id !== id)
  write(STUDENTS_KEY, next)
  const prefix = `wr_${id}_`
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix)) keys.push(key)
  }
  keys.forEach(key => localStorage.removeItem(key))
  if (localStorage.getItem(CURRENT_KEY) === id) setCurrentStudent(next[0].id)
  return next
}

// ---------- 当前学生 ----------

export function currentStudentId() {
  const list = listStudents()
  if (!list.length) return null
  const id = localStorage.getItem(CURRENT_KEY)
  if (id && list.some(s => s.id === id)) return id
  return list[0].id
}

export function currentStudent() {
  return findStudent(currentStudentId())
}

export function setCurrentStudent(id) {
  if (id) localStorage.setItem(CURRENT_KEY, id)
}

/** 挂在所有记录键前面的学生命名空间 */
export function scopedKey(name, studentId) {
  const sid = studentId || currentStudentId()
  return `wr_${sid}_${name}`
}

/** 直接读某个学生的数据（学生档案页做汇总用） */
export function readStudentData(studentId, name, fallback) {
  return read(`wr_${studentId}_${name}`, fallback)
}

/** 首次运行：创建默认学生，并把旧版全局数据迁移过来（旧键保留不删） */
export function ensureDefaultStudent() {
  let list = listStudents()
  if (!list.length) {
    const student = { id: makeStudentId(), name: DEFAULT_STUDENT_NAME, created_at: new Date().toISOString() }
    list = [student]
    write(STUDENTS_KEY, list)
    setCurrentStudent(student.id)
    migrateLegacyData(student.id)
    return student
  }
  if (!currentStudentId()) setCurrentStudent(list[0].id)
  return currentStudent()
}

function migrateLegacyData(studentId) {
  const legacyProgress = read(LEGACY_KEYS.progress, null)
  const legacyWrong = read(LEGACY_KEYS.wrong, null)
  const legacyRecords = read(LEGACY_KEYS.records, null)

  if (legacyProgress && !localStorage.getItem(scopedKey('progress', studentId))) {
    write(scopedKey('progress', studentId), legacyProgress)
  }
  if (Array.isArray(legacyWrong) && legacyWrong.length) {
    write(scopedKey('wrong', studentId), legacyWrong)
    const counts = {}
    for (const id of legacyWrong) counts[id] = { count: 1, lastAt: Date.now() }
    write(scopedKey('wrong_counts', studentId), counts)
  }
  if (legacyRecords && Object.keys(legacyRecords).length) {
    write(scopedKey('records', studentId), legacyRecords)
  }
}

// ---------- 学习进度（当前学生） ----------

export function getProgress() {
  return read(scopedKey('progress'), {})
}

export function saveProgress(wordId, data) {
  const progress = getProgress()
  progress[wordId] = { ...(progress[wordId] || {}), ...data }
  write(scopedKey('progress'), progress)
  return progress[wordId]
}

export function removeProgress(wordId) {
  const progress = getProgress()
  delete progress[wordId]
  write(scopedKey('progress'), progress)
}

// ---------- 错题本（当前学生） ----------

export function getWrongIds() {
  return read(scopedKey('wrong'), [])
}

export function getWrongCounts() {
  return read(scopedKey('wrong_counts'), {})
}

/** 答错：进错题本并累加错误次数 */
export function addWrong(wordId) {
  const wrong = getWrongIds()
  if (!wrong.includes(wordId)) write(scopedKey('wrong'), [...wrong, wordId])
  const counts = getWrongCounts()
  const item = counts[wordId] || { count: 0, lastAt: 0 }
  counts[wordId] = { count: item.count + 1, lastAt: Date.now() }
  write(scopedKey('wrong_counts'), counts)
  return counts[wordId]
}

/** 答对：移出错题本，错误次数保留（历史记录仍有价值） */
export function removeWrong(wordId) {
  const wrong = getWrongIds()
  if (!wrong.includes(wordId)) return
  write(scopedKey('wrong'), wrong.filter(id => id !== wordId))
}

// ---------- 学习记录（当前学生） ----------

export function getRecords() {
  return read(scopedKey('records'), {})
}

export function getTodayStudiedIds() {
  const studied = read(scopedKey('studied'), { date: '', ids: [] })
  return studied.date === todayStr() ? studied.ids : []
}

/** 记一次学习；同一天同一个词只算一次，返回今天已学词数 */
export function trackStudy(wordId) {
  const date = todayStr()
  const studied = read(scopedKey('studied'), { date: '', ids: [] })
  const ids = studied.date === date ? studied.ids : []
  if (wordId && ids.includes(wordId)) return ids.length
  if (wordId) ids.push(wordId)
  write(scopedKey('studied'), { date, ids })
  const records = getRecords()
  records[date] = ids.length
  write(scopedKey('records'), records)
  return ids.length
}

/** 连续学习天数 */
export function calcStreak(records) {
  const dates = Object.keys(records || {}).sort((a, b) => b.localeCompare(a))
  if (!dates.length) return 0
  const today = todayStr()
  const yesterday = todayStr(new Date(Date.now() - 86400000))
  if (dates[0] !== today && dates[0] !== yesterday) return 0
  let streak = 1
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i - 1]) - new Date(dates[i])) / 86400000
    if (Math.round(diff) === 1) streak++
    else break
  }
  return streak
}

// ---------- 每日任务（当前学生 + 词本） ----------

export function getTasks() {
  return read(scopedKey('tasks'), {})
}

export function saveTask(bookId, task) {
  const tasks = getTasks()
  tasks[bookId] = task
  write(scopedKey('tasks'), tasks)
}

export function dropTask(bookId) {
  const tasks = getTasks()
  delete tasks[bookId]
  write(scopedKey('tasks'), tasks)
}

// ---------- 设置（当前学生） ----------

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read(scopedKey('settings'), {}) }
}

export function saveSettings(patch) {
  const settings = { ...getSettings(), ...patch }
  write(scopedKey('settings'), settings)
  return settings
}

// ---------- 当前词本（按学生记忆） ----------

export function getStudentBookId(studentId) {
  return localStorage.getItem(scopedKey('book', studentId)) || null
}

export function setStudentBookId(bookId) {
  if (bookId) localStorage.setItem(scopedKey('book'), String(bookId))
  else localStorage.removeItem(scopedKey('book'))
}

/** 复习间隔（天）→ 毫秒；用到最后一档后仍按最后一档滚动 */
export function intervalMs(level) {
  const index = Math.min(Math.max(level, 1), EBBINGHAUS.length) - 1
  return EBBINGHAUS[index] * 86400000
}
