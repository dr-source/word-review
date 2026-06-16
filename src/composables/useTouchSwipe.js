import { onMounted, onUnmounted, ref } from 'vue'

/**
 * 触摸手势检测 composable
 * @param {string|HTMLElement} el - 元素选择器或 ref
 * @param {Object} handlers - { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown }
 * @param {number} threshold - 最小滑动距离（px），默认 50
 */
export function useTouchSwipe(el, handlers = {}, threshold = 50) {
  let startX = 0
  let startY = 0
  let startTime = 0
  let targetEl = null

  function getElement() {
    if (typeof el === 'string') {
      return document.querySelector(el)
    }
    return el
  }

  function handleTouchStart(e) {
    if (e.touches.length !== 1) return
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    startTime = Date.now()
  }

  function handleTouchEnd(e) {
    if (!startX || !startY) return
    const dx = e.changedTouches[0].clientX - startX
    const dy = e.changedTouches[0].clientY - startY
    const elapsed = Date.now() - startTime

    // 超过 300ms 不算滑动手势
    if (elapsed > 300) {
      startX = startY = 0
      return
    }

    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // 水平滑动
    if (absDx > threshold && absDx > absDy * 1.5) {
      if (dx > 0) handlers.onSwipeRight?.()
      else handlers.onSwipeLeft?.()
    }
    // 垂直滑动
    else if (absDy > threshold && absDy > absDx * 1.5) {
      if (dy > 0) handlers.onSwipeDown?.()
      else handlers.onSwipeUp?.()
    }

    startX = startY = 0
  }

  onMounted(() => {
    targetEl = getElement()
    if (targetEl) {
      targetEl.addEventListener('touchstart', handleTouchStart, { passive: true })
      targetEl.addEventListener('touchend', handleTouchEnd, { passive: true })
    }
  })

  onUnmounted(() => {
    if (targetEl) {
      targetEl.removeEventListener('touchstart', handleTouchStart)
      targetEl.removeEventListener('touchend', handleTouchEnd)
    }
  })
}
