/** 完成一天任务时固定显示的鼓励语 */
export const MAIN_ENCOURAGEMENT = '恭喜你，完成一天任务，继续坚持！'

/** 附加的花式鼓励，按日期确定性挑一条，同一天不会跳来跳去 */
export const EXTRA_ENCOURAGEMENTS = [
  '棒棒哒！',
  '好棒！',
  '太厉害了！',
  '今天的单词全部拿下！',
  '又坚持了一天，了不起！',
  '你的努力正在变成成绩！'
]

export function pickExtra(seed = '') {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return EXTRA_ENCOURAGEMENTS[Math.abs(h) % EXTRA_ENCOURAGEMENTS.length]
}

export function encouragementLine(seed = '') {
  return `${MAIN_ENCOURAGEMENT} ${pickExtra(seed)}`
}
