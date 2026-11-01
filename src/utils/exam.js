/** 100 词测试卷：抽词、打乱、算分与评级 */
export const EXAM_SIZE = 100

/** 一题 1 分：100 = Excellent，95 分以上 Good，90 分以上 Normal，90 以下 Come on */
export function examGrade(score) {
  const n = Math.max(0, Math.min(100, Math.round(Number(score) || 0)))
  if (n >= 100) return { label: 'Excellent', score: n, tip: '满分！100 个词一个没漏' }
  if (n >= 95) return { label: 'Good', score: n, tip: '非常接近满分，再稳一点就 Perfect' }
  if (n >= 90) return { label: 'Normal', score: n, tip: '基础不错，把错词再过一遍' }
  return { label: 'Come on', score: n, tip: '别急，先把今日任务里的词背熟再来' }
}

/** 抽 count 个可出题的词（有释义），顺序随机；词不够就有多少出多少 */
export function pickExamWords(words, count = EXAM_SIZE, rand = Math.random) {
  const pool = (words || []).filter(w => w && w.word && w.mean)
  const arr = pool.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, Math.max(1, Number(count) || EXAM_SIZE))
}
