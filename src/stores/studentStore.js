import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { LocalStore } from '../utils/localStore'
import {
  listStudents, currentStudentId, setCurrentStudent,
  addStudent as createStudent, renameStudent as updateStudent, removeStudent as deleteStudent,
  readStudentData, getStudentBookId, calcStreak, todayStr
} from '../utils/profile'

export const useStudentStore = defineStore('student', () => {
  const students = ref(listStudents())
  const currentId = ref(currentStudentId())

  const currentStudent = computed(() => students.value.find(s => s.id === currentId.value) || null)
  const currentName = computed(() => currentStudent.value?.name || '未选择学生')

  function refresh() {
    students.value = listStudents()
    currentId.value = currentStudentId()
  }

  /** 某个学生的整体情况（用于档案列表对比） */
  function summarize(studentId) {
    const bookId = getStudentBookId(studentId)
    const allWords = LocalStore.loadAllWords()
    const words = bookId ? allWords.filter(w => w.book_id === bookId) : allWords
    const progress = readStudentData(studentId, 'progress', {})
    const wrongIds = readStudentData(studentId, 'wrong', [])
    const records = readStudentData(studentId, 'records', {})
    const studied = readStudentData(studentId, 'studied', { date: '', ids: [] })
    const learned = words.filter(w => (progress[w.id]?.learnLevel || 0) > 0).length
    return {
      total: words.length,
      learned,
      rate: words.length ? Math.round((learned / words.length) * 100) : 0,
      wrong: wrongIds.length,
      today: studied.date === todayStr() ? studied.ids.length : 0,
      streak: calcStreak(records)
    }
  }

  function addStudent(name) {
    const student = createStudent(name)
    refresh()
    return student
  }

  function renameStudent(id, name) {
    updateStudent(id, name)
    refresh()
  }

  function removeStudent(id) {
    deleteStudent(id)
    refresh()
  }

  /** 切换学生：记录当前学生后整页重载，让所有数据按新命名空间重新加载 */
  function switchStudent(id) {
    if (!id || id === currentId.value) return
    setCurrentStudent(id)
    window.location.reload()
  }

  return {
    students, currentId, currentStudent, currentName,
    refresh, summarize, addStudent, renameStudent, removeStudent, switchStudent
  }
})
