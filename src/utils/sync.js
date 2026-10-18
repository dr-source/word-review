// 跨标签页同步
// 同一个浏览器里开多个标签页时，localStorage 的 storage 事件只在“其它”标签页触发，
// 用它把别的标签页写进去的数据同步到当前页，避免两个标签页各存一份不同的今日任务。
import { CURRENT_KEY, STUDENTS_KEY, currentStudentId } from './profile'

/** 是否为当前学生的数据键（wr_<学生id>_*） */
export function isStudentDataKey(key) {
  if (!key) return false
  const sid = currentStudentId()
  return !!sid && key.startsWith(`wr_${sid}_`)
}

/** 学生档案本身变了（新建 / 改名 / 删除 / 切换）：当前页必须整页重载才能对齐 */
export function isStudentListKey(key) {
  return key === STUDENTS_KEY || key === CURRENT_KEY
}

/**
 * 监听其它标签页的写入
 * @param {(key: string) => void} handler 需要刷新时回调，参数是变化的键
 * @returns {() => void} 取消监听
 */
export function onCrossTabChange(handler) {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {}
  function listener(event) {
    const key = event.key
    if (!isStudentListKey(key) && !isStudentDataKey(key)) return
    handler(key)
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}
