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
  BOOK_LIST: 'word_book_list',    // 教材词本列表
  WORD_DATA: 'word_all_data',     // 所有单词数据
  LEARN_RECORD: 'learn_record',   // 学习记录
  WRONG_WORDS: 'wrong_words'      // 错题本
}

// 艾宾浩斯复习间隔（分钟）
export const EBBINGHAUS = [
  5,    // 5分钟
  30,   // 30分钟
  1440, // 1天
  2880, // 2天
  5760, // 4天
  10080,// 7天
  20160 // 15天
]