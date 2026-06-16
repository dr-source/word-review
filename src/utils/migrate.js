/**
 * 数据迁移脚本：从 localStorage → Supabase
 * 使用方法：
 * 1. 打开 https://dr-source.github.io/word-review/
 * 2. F12 → Console
 * 3. 粘贴下面全部代码运行
 */
;(async function migrateToSupabase() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm')

  const supabaseUrl = 'https://YOUR_PROJECT.supabase.co'
  const supabaseKey = 'YOUR_ANON_KEY'

  const supabase = createClient(supabaseUrl, supabaseKey)

  // 读取旧数据
  const books = JSON.parse(localStorage.getItem('word_book_list') || '[]')
  const words = JSON.parse(localStorage.getItem('word_all_data') || '[]')
  const wrongWords = JSON.parse(localStorage.getItem('wrong_words') || '[]')
  const learnRecord = JSON.parse(localStorage.getItem('learn_record') || '{}')
  const personalProgress = JSON.parse(localStorage.getItem('word_personal_progress') || '{}')

  console.log(`📚 找到 ${books.length} 个词本, ${words.length} 个单词`)

  // 1. 导入词本
  const bookIdMap = {}
  for (const book of books) {
    const { data } = await supabase.from('books').insert({ name: book.name }).select().single()
    if (data) {
      bookIdMap[book.id] = data.id
      console.log(`  ✅ 词本: ${book.name} → ID ${data.id}`)
    }
  }

  // 2. 导入单词
  let wordCount = 0
  for (const word of words) {
    const newBookId = bookIdMap[word.bookId]
    if (!newBookId) continue

    const { data } = await supabase.from('words').insert({
      book_id: newBookId,
      word: word.word,
      phonetic: word.phonetic || '',
      mean: word.mean || '',
      sentence: word.sentence || ''
    }).select().single()

    if (data) {
      wordCount++
      // 同时迁移个人进度
      const oldProgress = personalProgress[word.id] || {}
      const newProgress = {
        learnLevel: word.learnLevel || oldProgress.learnLevel || 0,
        nextReview: word.nextReview || oldProgress.nextReview || 0,
        star: word.star || oldProgress.star || false,
        note: word.note || oldProgress.note || ''
      }
      localStorage.setItem('word_personal_progress',
        JSON.stringify({
          ...JSON.parse(localStorage.getItem('word_personal_progress') || '{}'),
          [data.id]: newProgress
        })
      )

      // 迁移错题本
      if (wrongWords.includes(word.id)) {
        const current = JSON.parse(localStorage.getItem('wrong_words') || '[]')
        if (!current.includes(data.id)) {
          current.push(data.id)
          localStorage.setItem('wrong_words', JSON.stringify(current))
        }
      }
    }
  }

  // 迁移学习记录
  if (Object.keys(learnRecord).length > 0) {
    const old = JSON.parse(localStorage.getItem('learn_record') || '{}')
    const merged = { ...old, ...learnRecord }
    localStorage.setItem('learn_record', JSON.stringify(merged))
  }

  console.log(`\n🎉 迁移完成！`)
  console.log(`   导入 ${wordCount} 个单词到 ${Object.keys(bookIdMap).length} 个词本`)
  console.log(`   个人进度已同步`)
  console.log(`   🔄 请刷新页面查看`)
})()
