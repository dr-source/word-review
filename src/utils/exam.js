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

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * 抽 count 个可出题的词（有释义），顺序随机；词不够就有多少出多少。
 * opts.priorityIds 里的词（错题本）优先占位，保证记过的错词一定会被考到。
 */
export function pickExamWords(words, count = EXAM_SIZE, rand = Math.random, opts = {}) {
  const pool = (words || []).filter(w => w && w.word && w.mean)
  const size = Math.max(1, Number(count) || EXAM_SIZE)
  const priorityIds = new Set(opts.priorityIds || [])
  const must = []
  const rest = []
  for (const w of pool) {
    if (priorityIds.size && priorityIds.has(w.id)) must.push(w)
    else rest.push(w)
  }
  shuffle(must, rand)
  shuffle(rest, rand)
  const picked = must.slice(0, size)
  if (picked.length < size) picked.push(...rest.slice(0, size - picked.length))
  // 再洗一次，错词不固定占卷首
  return shuffle(picked, rand)
}
