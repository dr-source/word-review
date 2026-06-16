import { onUnmounted } from 'vue'

/**
 * Chart.js 生命周期管理 composable
 * @param {string} canvasId - canvas 元素 ID
 * @param {Function} setupFn - (canvas, canvasId) => Chart 实例
 */
export function useChart(canvasId, setupFn) {
  let chartInstance = null

  function render() {
    if (chartInstance) chartInstance.destroy()
    const canvas = document.getElementById(canvasId)
    if (!canvas) return
    chartInstance = setupFn(canvas, canvasId)
  }

  function destroy() {
    if (chartInstance) {
      chartInstance.destroy()
      chartInstance = null
    }
  }

  onUnmounted(destroy)

  return { render, destroy }
}
