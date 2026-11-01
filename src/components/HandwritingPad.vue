<template>
  <div class="handwriting-pad">
    <div class="pad-frame">
      <canvas
        ref="canvasRef"
        class="pad-canvas"
        @pointerdown="handleDown"
        @pointermove="handleMove"
        @pointerup="handleUp"
        @pointercancel="handleUp"
        @pointerleave="handleUp"
      ></canvas>
      <span v-if="empty" class="pad-placeholder">在这里手写英文单词</span>
    </div>
    <div class="pad-toolbar">
      <span class="pad-tip">用手指／鼠标写，写完点「对答案」，再自己判断写对没写对</span>
      <el-button size="small" text class="pad-clear" @click="clear">🧽 擦掉重写</el-button>
    </div>
  </div>
</template>

<script setup>
/**
 * 手写板：canvas 手写，四线格做底。
 * 不做手写识别（离线环境没有可靠的 OCR），由学生写完后自评对错。
 */
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref(null)
const empty = ref(true)

let ctx = null
let drawing = false
let lastPoint = null
let boxWidth = 0
let boxHeight = 0

const INK = '#1F2937'
const INK_WIDTH = 3

function drawGuides() {
  if (!ctx) return
  ctx.save()
  ctx.strokeStyle = '#E2E8F0'
  ctx.lineWidth = 1
  const lines = [0.28, 0.5, 0.72]
  for (const ratio of lines) {
    const y = Math.round(boxHeight * ratio) + 0.5
    ctx.beginPath()
    ctx.moveTo(12, y)
    ctx.lineTo(boxWidth - 12, y)
    ctx.stroke()
  }
  // 基线加深一点，方便对齐字母底部
  const base = Math.round(boxHeight * 0.72) + 0.5
  ctx.strokeStyle = '#CBD5E1'
  ctx.beginPath()
  ctx.moveTo(12, base)
  ctx.lineTo(boxWidth - 12, base)
  ctx.stroke()
  ctx.restore()
}

function resize() {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  boxWidth = Math.max(1, rect.width)
  boxHeight = Math.max(1, rect.height)
  canvas.width = Math.round(boxWidth * ratio)
  canvas.height = Math.round(boxHeight * ratio)
  ctx = canvas.getContext('2d')
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  drawGuides()
  empty.value = true
}

function clear() {
  if (!ctx) return
  ctx.clearRect(0, 0, boxWidth, boxHeight)
  drawGuides()
  drawing = false
  lastPoint = null
  empty.value = true
}

function pointOf(event) {
  const rect = canvasRef.value.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function handleDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  event.preventDefault()
  if (!ctx) return
  drawing = true
  lastPoint = pointOf(event)
  try { canvasRef.value.setPointerCapture(event.pointerId) } catch { /* 老浏览器忽略 */ }
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(lastPoint.x, lastPoint.y, INK_WIDTH / 2, 0, Math.PI * 2)
  ctx.fill()
  empty.value = false
}

function handleMove(event) {
  if (!drawing || !ctx) return
  event.preventDefault()
  const point = pointOf(event)
  ctx.strokeStyle = INK
  ctx.lineWidth = INK_WIDTH
  ctx.beginPath()
  ctx.moveTo(lastPoint.x, lastPoint.y)
  ctx.lineTo(point.x, point.y)
  ctx.stroke()
  lastPoint = point
  empty.value = false
}

function handleUp() {
  drawing = false
  lastPoint = null
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
})

onUnmounted(() => {
  window.removeEventListener('resize', resize)
})

defineExpose({ clear, isEmpty: empty })
</script>

<style scoped>
.handwriting-pad { width: 100%; }
.pad-frame { position: relative; }
.pad-canvas {
  display: block;
  width: 100%;
  height: 150px;
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: #FFFFFF;
  touch-action: none;
  cursor: crosshair;
}
.pad-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--color-text-muted);
  pointer-events: none;
}
.pad-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.pad-tip { font-size: 11px; color: var(--color-text-muted); line-height: 1.5; text-align: left; flex: 1; }
.pad-clear { flex-shrink: 0; }
@media (max-width: 640px) {
  .pad-canvas { height: 130px; }
}
</style>
