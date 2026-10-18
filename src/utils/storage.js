// 本地持久化封装
export const Storage = {
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
  },
  get(key) {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
  },
  remove(key) {
    localStorage.removeItem(key)
  },
  clear() {
    localStorage.clear()
  }
}

// 数据常量定义
export const DB_KEYS = {
  BOOK_LIST: 'word_book_list',    // 旧版教材词本列表（仅保留兼容/导入导出）
  WORD_DATA: 'word_all_data',     // 旧版所有单词数据（仅保留兼容/导入导出）
  LEARN_RECORD: 'learn_record',   // 旧版学习记录，迁移后归入“默认学生”
  WRONG_WORDS: 'wrong_words',     // 旧版错题本，迁移后归入“默认学生”
  PROGRESS: 'word_personal_progress', // 旧版个人进度，迁移后归入“默认学生”
  STUDENTS: 'word_review_students',   // 学生档案列表
  CURRENT_STUDENT: 'word_review_current_student', // 当前学生 id
  LOCAL_BOOKS: 'word_review_local_books',  // 本地词本
  LOCAL_WORDS: 'word_review_local_words'   // 本地单词
}

// 艾宾浩斯复习间隔（天）：答对一次升一级，按下一档安排复习
export const EBBINGHAUS = [
  1,  // 第 1 次复习：1 天后
  2,  // 2 天
  4,  // 4 天
  7,  // 7 天
  15, // 15 天
  30, // 30 天
  60  // 60 天，之后继续按 60 天滚动
]
