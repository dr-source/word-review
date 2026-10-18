import { ref } from 'vue'

/**
 * 触摸滑动手势
 * 直接把返回的三个处理函数绑到模板上（@touchstart / @touchmove / @touchend），
 * 这样卡片是 v-if 渲染出来的也能绑上，不像 querySelector 那样取不到元素。
 *
 * @param {Object} handlers { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown }
 * @param {Object} options { threshold 最小距离(px), maxDuration 最长手势时长(ms) }
 */
export function useTouchSwipe(handlers = {}, options = {}) {
  const threshold = options.threshold ?? 50
  const maxDuration = options.maxDuration ?? 1000

  let start = null
  let last = null
  // 最近一次滑动的时间戳，用来忽略浏览器在 touchend 之后补发的 click
  const swipedAt = ref(0)

  function onTouchStart(event) {
    const touch = event.touches?.[0]
    if (event.touches?.length !== 1 || !touch) {
      start = null
      last = null
      return
    }
    start = { x: touch.clientX, y: touch.clientY, at: Date.now() }
    last = { x: touch.clientX, y: touch.clientY }
  }

  function onTouchMove(event) {
    const touch = event.touches?.[0]
    if (touch) last = { x: touch.clientX, y: touch.clientY }
  }

  function onTouchEnd(event) {
    const from = start
    start = null
    if (!from) return
    const touch = event.changedTouches?.[0]
    const to = touch ? { x: touch.clientX, y: touch.clientY } : last
    last = null
    if (!to) return

    if (Date.now() - from.at > maxDuration) return

    const dx = to.x - from.x
    const dy = to.y - from.y
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)

    let fired = null
    if (absX > threshold && absX > absY * 1.2) {
      fired = dx > 0 ? handlers.onSwipeRight : handlers.onSwipeLeft
    } else if (absY > threshold && absY > absX * 1.2) {
      fired = dy > 0 ? handlers.onSwipeDown : handlers.onSwipeUp
    }
    if (!fired) return
    swipedAt.value = Date.now()
    fired()
  }

  /** 滑动刚结束时浏览器还会补一个 click，用它判断是否需要忽略 */
  function justSwiped(window = 400) {
    return Date.now() - swipedAt.value < window
  }

  return { onTouchStart, onTouchMove, onTouchEnd, justSwiped }
}
